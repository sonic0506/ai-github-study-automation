import type {
  IsoDate,
  RankingEntry,
  RankingResult,
  RepositoryId,
  RepositoryInfo,
  RepositoryObservation,
  Snapshot,
} from '../../../src/core/types.js';

/**
 * github-star-analyzer 핵심 로직 (순수 함수).
 * 같은 입력 → 같은 출력. 시간/FS/네트워크에 의존하지 않는다.
 */

export interface AnalyzerOptions {
  /** TOP N 크기 (기본 10) */
  topN: number;
  /** Growth TOP 포함 최소 delta (기본 1 → 0 이하 증가는 제외) */
  growthMinDelta: number;
}

export const DEFAULT_ANALYZER_OPTIONS: AnalyzerOptions = { topN: 10, growthMinDelta: 1 };

export interface AnalyzerInput {
  date: IsoDate;
  current: RepositoryObservation[];
  previousSnapshot: Snapshot | null;
  /** registry 에 기록된 최초 발견일 (repository → date). 없으면 오늘 날짜 */
  firstSeen?: Record<RepositoryId, IsoDate>;
  options?: Partial<AnalyzerOptions>;
}

export interface AnalyzerOutput {
  date: IsoDate;
  repositories: RepositoryInfo[];
  rankings: RankingResult;
  snapshot: Snapshot;
}

/** Repository 식별자 비교용 키 (GitHub 는 owner/name 대소문자를 구분하지 않음) */
export const repoKey = (id: RepositoryId): string => id.trim().toLowerCase();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertValidObservation(o: RepositoryObservation): void {
  if (!o.repository || !o.repository.includes('/')) {
    throw new Error(`Invalid repository id: "${o.repository}"`);
  }
  if (!Number.isInteger(o.stars) || o.stars < 0) {
    throw new Error(`Invalid stars for ${o.repository}: ${o.stars}`);
  }
}

/**
 * 중복 Repository 제거.
 * 동일 키가 여러 번 나오면 stars 가 큰 관측값을 유지하고(동률이면 먼저 나온 것),
 * 누락된 description 은 다른 관측값으로 보완한다.
 */
export function dedupeObservations(items: RepositoryObservation[]): RepositoryObservation[] {
  const map = new Map<string, RepositoryObservation>();
  for (const item of items) {
    assertValidObservation(item);
    const key = repoKey(item.repository);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...item });
      continue;
    }
    const winner = item.stars > prev.stars ? { ...item } : prev;
    const loser = winner === prev ? item : prev;
    winner.description = winner.description ?? loser.description ?? null;
    map.set(key, winner);
  }
  return [...map.values()];
}

export function indexSnapshot(snapshot: Snapshot | null): Map<string, number> {
  const index = new Map<string, number>();
  for (const e of snapshot?.repositories ?? []) index.set(repoKey(e.repository), e.stars);
  return index;
}

export function computeDelta(stars: number, previousStars: number | null): number | null {
  return previousStars === null ? null : stars - previousStars;
}

export function toRepositoryInfo(
  o: RepositoryObservation,
  previous: Map<string, number>,
  firstSeen: Record<RepositoryId, IsoDate>,
  date: IsoDate,
): RepositoryInfo {
  const key = repoKey(o.repository);
  const previousStars = previous.get(key) ?? null;
  const knownFirstSeen = findFirstSeen(firstSeen, key);
  return {
    repository: o.repository,
    url: o.url,
    description: o.description ?? null,
    stars: o.stars,
    previousStars,
    delta24h: computeDelta(o.stars, previousStars),
    firstSeen: knownFirstSeen ?? date,
    isNew: previousStars === null,
  };
}

function findFirstSeen(firstSeen: Record<RepositoryId, IsoDate>, key: string): IsoDate | undefined {
  for (const [id, d] of Object.entries(firstSeen)) if (repoKey(id) === key) return d;
  return undefined;
}

const byRepository = (a: RepositoryInfo, b: RepositoryInfo) =>
  repoKey(a.repository) < repoKey(b.repository) ? -1 : repoKey(a.repository) > repoKey(b.repository) ? 1 : 0;

const withRank = (items: RepositoryInfo[]): RankingEntry[] => items.map((r, i) => ({ ...r, rank: i + 1 }));

export function rankByTotalStars(repos: RepositoryInfo[], topN: number): RankingEntry[] {
  return withRank([...repos].sort((a, b) => b.stars - a.stars || byRepository(a, b)).slice(0, topN));
}

export function rankByGrowth(repos: RepositoryInfo[], topN: number, minDelta: number): RankingEntry[] {
  const eligible = repos.filter((r): r is RepositoryInfo & { delta24h: number } => r.delta24h !== null && r.delta24h >= minDelta);
  return withRank(eligible.sort((a, b) => b.delta24h - a.delta24h || b.stars - a.stars || byRepository(a, b)).slice(0, topN));
}

export function listNewlyDiscovered(repos: RepositoryInfo[]): RepositoryInfo[] {
  return repos.filter((r) => r.isNew).sort((a, b) => b.stars - a.stars || byRepository(a, b));
}

export function buildSnapshot(date: IsoDate, repos: RepositoryInfo[]): Snapshot {
  return {
    version: 1,
    date,
    repositories: [...repos].sort(byRepository).map((r) => ({ repository: r.repository, stars: r.stars })),
  };
}

export function analyzeStars(input: AnalyzerInput): AnalyzerOutput {
  if (!DATE_RE.test(input.date)) throw new Error(`Invalid date: ${input.date}`);
  if (input.previousSnapshot && input.previousSnapshot.date >= input.date) {
    throw new Error(`previousSnapshot.date (${input.previousSnapshot.date}) must be before date (${input.date})`);
  }
  const opts: AnalyzerOptions = { ...DEFAULT_ANALYZER_OPTIONS, ...input.options };
  const previous = indexSnapshot(input.previousSnapshot);
  const repositories = dedupeObservations(input.current)
    .map((o) => toRepositoryInfo(o, previous, input.firstSeen ?? {}, input.date))
    .sort(byRepository);

  return {
    date: input.date,
    repositories,
    rankings: {
      totalStarsTop10: rankByTotalStars(repositories, opts.topN),
      growth24hTop10: rankByGrowth(repositories, opts.topN, opts.growthMinDelta),
      newlyDiscovered: listNewlyDiscovered(repositories),
    },
    snapshot: buildSnapshot(input.date, repositories),
  };
}
