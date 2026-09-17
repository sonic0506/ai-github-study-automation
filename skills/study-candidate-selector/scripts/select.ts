import type {
  IsoDate,
  RankingHistory,
  RankingResult,
  RepositoryId,
  RepositoryInfo,
  StudyCandidate,
  StudyCandidateStatus,
  StudyQueue,
  StudyState,
} from '../../../src/core/types.js';
import type { StudyPolicy } from '../../../src/core/config.js';

/**
 * study-candidate-selector 핵심 로직 (순수 함수).
 *
 * 1. Ranking(TOP10 / Growth / 신규)에서 후보 pool 을 만든다.
 * 2. 각 요소를 0~1 로 정규화하고 policy.priority 가중치를 곱해 priority 를 계산한다.
 * 3. skip_if 규칙에 해당하면 skipped_* 상태로 표시한다.
 * 4. 남은 후보 중 상위 max_daily_drafts 개를 selected, 나머지는 queued 로 표시한다.
 */

export interface SelectorInput {
  date: IsoDate;
  rankings: RankingResult;
  policy: StudyPolicy;
  /** 최근 window 동안 TOP10 등장 일수 (오늘 포함). 없으면 오늘 등장 여부(0/1)로 대체 */
  history?: Record<RepositoryId, RankingHistory>;
  /** 기존 Study / PR 상태. 없으면 미작성으로 간주 */
  studyStates?: Record<RepositoryId, StudyState>;
}

export interface ScoreBreakdown {
  growth24h: number;
  repeatedTop10: number;
  totalStars: number;
  newRepository: number;
}

interface PoolItem {
  info: RepositoryInfo;
  inTodayTop10: boolean;
}

const key = (id: RepositoryId) => id.trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function lookup<T>(record: Record<RepositoryId, T> | undefined, id: RepositoryId): T | undefined {
  if (!record) return undefined;
  if (id in record) return record[id];
  const k = key(id);
  for (const [rid, v] of Object.entries(record)) if (key(rid) === k) return v;
  return undefined;
}

export function buildCandidatePool(rankings: RankingResult): PoolItem[] {
  const pool = new Map<string, PoolItem>();
  const add = (info: RepositoryInfo, top10: boolean) => {
    const k = key(info.repository);
    const existing = pool.get(k);
    if (existing) existing.inTodayTop10 ||= top10;
    else pool.set(k, { info, inTodayTop10: top10 });
  };
  rankings.totalStarsTop10.forEach((r) => add(r, true));
  rankings.growth24hTop10.forEach((r) => add(r, true));
  rankings.newlyDiscovered.forEach((r) => add(r, false));
  return [...pool.values()];
}

export function scoreComponents(
  item: PoolItem,
  ctx: { maxDelta: number; maxStars: number; windowDays: number; history?: RankingHistory },
): ScoreBreakdown {
  const { info } = item;
  const delta = info.delta24h ?? 0;
  const top10Days = ctx.history?.top10Days ?? (item.inTodayTop10 ? 1 : 0);
  return {
    growth24h: ctx.maxDelta > 0 && delta > 0 ? clamp01(delta / ctx.maxDelta) : 0,
    repeatedTop10: clamp01(top10Days / ctx.windowDays),
    totalStars: ctx.maxStars > 0 ? clamp01(Math.log10(info.stars + 1) / Math.log10(ctx.maxStars + 1)) : 0,
    newRepository: info.isNew ? 1 : 0,
  };
}

export function weightedPriority(s: ScoreBreakdown, w: StudyPolicy['priority']): number {
  return round2(
    s.growth24h * w.growth_24h +
      s.repeatedTop10 * w.repeated_top10 +
      s.totalStars * w.total_stars +
      s.newRepository * w.new_repository,
  );
}

export function describeReasons(info: RepositoryInfo, s: ScoreBreakdown, top10Days: number, windowDays: number): string[] {
  const reasons: string[] = [];
  if (s.growth24h > 0) reasons.push(`growth_24h: +${info.delta24h} stars`);
  if (s.repeatedTop10 > 0) reasons.push(`repeated_top10: ${top10Days}/${windowDays} days`);
  if (s.totalStars > 0) reasons.push(`total_stars: ${info.stars}`);
  if (s.newRepository > 0) reasons.push('new_repository');
  return reasons;
}

export function skipStatus(state: StudyState | undefined, skipIf: StudyPolicy['skip_if']): StudyCandidateStatus | null {
  if (!state) return null;
  if (skipIf.study_exists && state.studyExists) return 'skipped_study_exists';
  if (skipIf.pr_open && state.prOpen) return 'skipped_pr_open';
  if (skipIf.not_studyable && state.notStudyable) return 'skipped_not_studyable';
  return null;
}

export function selectStudyCandidates(input: SelectorInput): StudyQueue {
  const { policy } = input;
  const pool = buildCandidatePool(input.rankings);
  const maxDelta = Math.max(0, ...pool.map((p) => p.info.delta24h ?? 0));
  const maxStars = Math.max(0, ...pool.map((p) => p.info.stars));
  const windowDays = policy.repeated_top10_window_days;

  const scored = pool.map((item) => {
    const history = lookup(input.history, item.info.repository);
    const s = scoreComponents(item, { maxDelta, maxStars, windowDays, history });
    const top10Days = history?.top10Days ?? (item.inTodayTop10 ? 1 : 0);
    const skip = skipStatus(lookup(input.studyStates, item.info.repository), policy.skip_if);
    return {
      stars: item.info.stars,
      candidate: {
        repository: item.info.repository,
        priority: weightedPriority(s, policy.priority),
        reasons: [...describeReasons(item.info, s, top10Days, windowDays), ...(skip ? [skip.replace('skipped_', 'skip: ')] : [])],
        status: skip ?? 'queued',
      } satisfies StudyCandidate,
    };
  });

  const order = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.candidate.priority - a.candidate.priority ||
    b.stars - a.stars ||
    (key(a.candidate.repository) < key(b.candidate.repository) ? -1 : 1);

  const eligible = scored.filter((x) => x.candidate.status === 'queued').sort(order);
  const skipped = scored.filter((x) => x.candidate.status !== 'queued').sort(order);
  eligible.forEach((x, i) => {
    if (i < policy.max_daily_drafts) x.candidate.status = 'selected';
  });

  return {
    version: 1,
    date: input.date,
    maxDailyDrafts: policy.max_daily_drafts,
    candidates: [...eligible, ...skipped].map((x) => x.candidate),
  };
}

/**
 * 선정된 후보가 조사 단계에서 Study 대상이 아니라고 판정되었을 때 호출한다.
 * - 대상은 skipped_not_studyable 로 바꾸고 skip 사유를 추가한다.
 * - 대상이 selected 였다면 queued 중 가장 우선순위가 높은 후보를 selected 로 올린다.
 * 입력 queue 는 변경하지 않는다.
 */
export function markNotStudyable(queue: StudyQueue, repository: RepositoryId): { queue: StudyQueue; promoted: RepositoryId | null } {
  const k = key(repository);
  const candidates = queue.candidates.map((c) => ({ ...c, reasons: [...c.reasons] }));
  const target = candidates.find((c) => key(c.repository) === k);
  if (!target) throw new Error(`Not in study queue: ${repository}`);
  if (target.status === 'skipped_not_studyable') return { queue: { ...queue, candidates }, promoted: null };

  const wasSelected = target.status === 'selected';
  target.status = 'skipped_not_studyable';
  target.reasons.push('skip: not_studyable');

  let promoted: RepositoryId | null = null;
  if (wasSelected) {
    const next = candidates.find((c) => c.status === 'queued');
    if (next) {
      next.status = 'selected';
      promoted = next.repository;
    }
  }
  // 순서: 선정·대기 후보(기존 순서) → skip 후보(기존 순서, 대상은 priority 위치에 삽입)
  const active = candidates.filter((c) => c !== target && !c.status.startsWith('skipped_'));
  const skipped = candidates.filter((c) => c !== target && c.status.startsWith('skipped_'));
  const at = skipped.findIndex((c) => c.priority < target.priority);
  skipped.splice(at === -1 ? skipped.length : at, 0, target);
  return { queue: { ...queue, candidates: [...active, ...skipped] }, promoted };
}

export const selectedRepositories = (queue: StudyQueue): RepositoryId[] =>
  queue.candidates.filter((c) => c.status === 'selected').map((c) => c.repository);
