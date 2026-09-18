import type { ReportConfig } from '../../../src/core/config.js';
import { renderTemplate } from '../../../src/core/template.js';
import type {
  Baseline,
  IsoDate,
  RankingEntry,
  RankingResult,
  RepositoryInfo,
  StudyCandidate,
  StudyQueue,
} from '../../../src/core/types.js';

/**
 * daily-report-writer 핵심 로직 (순수 함수).
 * Ranking / Study Queue 를 고정 템플릿에 그대로 옮겨 담는다.
 * - 숫자·순위는 입력값 그대로 (천 단위 구분 기호만 추가)
 * - 한 줄 요약은 GitHub description 원문 (길면 … 로 자름)
 * - 새로 계산하거나 문장을 지어내지 않는다
 */

export interface RenderInput {
  date: IsoDate;
  baseline: Baseline | null;
  rankings: RankingResult;
  studyQueue: StudyQueue;
  /** 수집 전체 개수 (없으면 TOP/신규에서 추정하지 않고 0) */
  repositoryCount?: number;
  config: ReportConfig;
  templates: { report: string; telegram: string };
}

export interface RenderOutput {
  dailyReport: { path: string; markdown: string };
  telegram: { markdown: string };
}

const num = (n: number): string => n.toLocaleString('en-US');

/** Markdown 표 안에서 줄바꿈·파이프가 표를 깨지 않게 정리하고 길이를 자른다 */
export function cleanDescription(description: string | null, maxLength: number): string {
  const text = (description ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  if (!text) return '-';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatDelta(delta: number | null): string {
  if (delta === null) return 'NEW';
  return delta > 0 ? `+${num(delta)}` : num(delta);
}

export function baselineLabel(baseline: Baseline | null): string {
  if (!baseline) return '없음 (이전 스냅샷 없음 — 증가량은 다음 실행부터)';
  return baseline.gapDays === 1 ? `${baseline.date} (전날)` : `${baseline.date} (${baseline.gapDays}일 전)`;
}

const repoUrl = (r: { repository: string; url?: string }) => r.url ?? `https://github.com/${r.repository}`;

const rankRow = (r: RankingEntry, maxLength: number) => ({
  rank: r.rank,
  repository: r.repository,
  url: repoUrl(r),
  stars: num(r.stars),
  delta: formatDelta(r.delta24h),
  description: cleanDescription(r.description, maxLength),
});

const candidateRow = (c: StudyCandidate, byRepository: Map<string, RepositoryInfo>) => ({
  repository: c.repository,
  url: repoUrl({ repository: c.repository, url: byRepository.get(c.repository.toLowerCase())?.url }),
  priority: c.priority.toFixed(2),
  status: c.status,
  reasons: c.reasons.join(', ') || '-',
});

export function buildReportView(input: RenderInput): Record<string, unknown> {
  const { rankings, studyQueue, config, baseline } = input;
  const max = config.description_max_length;
  const byRepository = new Map<string, RepositoryInfo>();
  for (const r of [...rankings.totalStarsTop10, ...rankings.growth24hTop10, ...rankings.newlyDiscovered]) {
    byRepository.set(r.repository.toLowerCase(), r);
  }
  const newly = rankings.newlyDiscovered;
  const shown = newly.slice(0, config.newly_discovered_limit);
  const selected = studyQueue.candidates.filter((c) => c.status === 'selected');
  const repositoryCount = input.repositoryCount ?? 0;
  const noBaseline = baseline === null;
  // 기준 스냅샷이 없는 경우는 두 가지다.
  // (1) 진짜 첫 수집: Registry 가 비어 있어 모든 저장소가 신규.
  // (2) 같은 날짜 기록만 있는 재실행: 신규는 0인데 비교 대상만 없다.
  // 둘을 구분하지 않으면 "첫 수집인데 신규 0개" 같은 모순된 문구가 나간다.
  const isBootstrap = noBaseline && repositoryCount > 0 && newly.length === repositoryCount;

  return {
    date: input.date,
    topN: Math.max(rankings.totalStarsTop10.length, rankings.growth24hTop10.length),
    telegramTopN: config.telegram_growth_top,
    repositoryCount: num(repositoryCount),
    newCount: num(newly.length),
    selectedCount: num(selected.length),
    candidateCount: num(studyQueue.candidates.length),
    baselineLabel: baselineLabel(baseline),
    reportPath: config.report_path.replace('{date}', input.date),
    hasGrowth: rankings.growth24hTop10.length > 0,
    noGrowthReason: noBaseline
      ? '비교할 이전 스냅샷이 없어 이번에는 증가량을 계산하지 않았다.'
      : '기준일 대비 Star가 증가한 저장소가 없다.',
    bootstrapNote: isBootstrap ? '첫 수집이라 모든 저장소가 신규로 잡혔다.' : '',
    growth: rankings.growth24hTop10.map((r) => rankRow(r, max)),
    growthTop: rankings.growth24hTop10.slice(0, config.telegram_growth_top).map((r) => rankRow(r, max)),
    totalStars: rankings.totalStarsTop10.map((r) => rankRow(r, max)),
    newly: shown.map((r) => ({
      repository: r.repository,
      url: repoUrl(r),
      stars: num(r.stars),
      description: cleanDescription(r.description, max),
    })),
    newMoreCount: newly.length > shown.length ? num(newly.length - shown.length) : '',
    selected: selected.map((c) => candidateRow(c, byRepository)),
    candidates: studyQueue.candidates.map((c) => candidateRow(c, byRepository)),
  };
}

export function renderDailyReport(input: RenderInput): RenderOutput {
  if (input.studyQueue.date !== input.date) {
    throw new Error(`studyQueue.date (${input.studyQueue.date}) must equal date (${input.date})`);
  }
  const view = buildReportView(input);
  return {
    dailyReport: {
      path: input.config.report_path.replace('{date}', input.date),
      markdown: renderTemplate(input.templates.report, view),
    },
    telegram: { markdown: renderTemplate(input.templates.telegram, view) },
  };
}
