import type { GitHubReadAdapter, GitHubRepoItem } from '../../../src/adapters/github.js';
import type { DiscoveryConfig } from '../../../src/core/config.js';
import { addDays } from '../../../src/core/dates.js';
import type { IsoDate, RepositoryId, RepositoryObservation } from '../../../src/core/types.js';
import { normalizeSearchResults, toObservation, type DiscoveryOutput } from './normalize.js';

/**
 * github-ai-discovery 수집 절차 (adapter 주입, 파일 시스템 비의존).
 *
 * 1. topic 검색   : topic:{t} stars:>=N pushed:>=D archived:false fork:false   (Star 순)
 * 2. 신규 검색    : topic:{t} stars:>=M created:>=D archived:false fork:false  (Star 순)
 * 3. 정규화       : 필터 · 중복 제거 · topic 병합 (normalize.ts)
 * 4. 등록 저장소 추적: Registry 에 있지만 1~2 에 없는 저장소를 개별 조회해 Star 수 기록
 *    (Star/push 기준은 적용하지 않음. 삭제·접근 불가·archived 는 제외)
 */

export type QueryKind = 'topic' | 'new';

export interface PlannedQuery {
  kind: QueryKind;
  topic: string;
  q: string;
  limit: number;
}

export interface DiscoverStats {
  queries: number;
  rawResults: Record<QueryKind, number>;
  searched: number;
  tracking: {
    candidates: number;
    checked: number;
    added: RepositoryId[];
    missing: RepositoryId[];
    archived: RepositoryId[];
    skippedOverLimit: number;
    /** rate limit 으로 중단되어 조회하지 못한 수 (수집 결과는 유지) */
    stoppedByRateLimit: number;
  };
  total: number;
}

export interface DiscoverResult {
  output: DiscoveryOutput;
  stats: DiscoverStats;
}

export interface DiscoverInput {
  date: IsoDate;
  config: DiscoveryConfig;
  adapter: GitHubReadAdapter;
  /** Registry 에 등록된 저장소 목록 */
  registered?: RepositoryId[];
  onProgress?: (message: string) => void;
}

function qualifiers(cfg: DiscoveryConfig): string[] {
  return [
    ...(cfg.search.exclude_archived ? ['archived:false'] : []),
    ...(cfg.search.exclude_forks ? ['fork:false'] : []),
  ];
}

export function buildQueries(config: DiscoveryConfig, date: IsoDate): PlannedQuery[] {
  const out: PlannedQuery[] = [];
  const { search, new_repositories: nr } = config;
  for (const topic of config.topics) {
    const parts = [`topic:${topic}`, `stars:>=${config.minimum_stars}`];
    if (search.pushed_within_days > 0) parts.push(`pushed:>=${addDays(date, -search.pushed_within_days)}`);
    out.push({ kind: 'topic', topic, q: [...parts, ...qualifiers(config)].join(' '), limit: search.max_results_per_topic });
  }
  if (nr.enabled) {
    for (const topic of config.topics) {
      const parts = [`topic:${topic}`, `stars:>=${nr.minimum_stars}`, `created:>=${addDays(date, -nr.created_within_days)}`];
      out.push({ kind: 'new', topic, q: [...parts, ...qualifiers(config)].join(' '), limit: nr.max_results_per_topic });
    }
  }
  return out;
}

export async function discoverRepositories(input: DiscoverInput): Promise<DiscoverResult> {
  const { date, config, adapter } = input;
  const log = input.onProgress ?? (() => {});
  const queries = buildQueries(config, date);
  const rawResults: Record<QueryKind, number> = { topic: 0, new: 0 };
  const resultsByKey: Record<string, GitHubRepoItem[]> = {};

  for (const [i, pq] of queries.entries()) {
    log(`[${i + 1}/${queries.length}] ${pq.kind.padEnd(5)} ${pq.q}`);
    const items = await adapter.searchRepositories(pq.q, pq.limit);
    rawResults[pq.kind] += items.length;
    resultsByKey[`${pq.kind}:${pq.topic}`] = items;
  }

  const minimumStars = config.new_repositories.enabled
    ? Math.min(config.minimum_stars, config.new_repositories.minimum_stars)
    : config.minimum_stars;
  const searched = normalizeSearchResults(date, resultsByKey, {
    minimumStars,
    excludeArchived: config.search.exclude_archived,
    excludeForks: config.search.exclude_forks,
  });

  const tracking = await trackRegistered(searched.repositories, input.registered ?? [], config, adapter, log);
  const repositories = sortRepos([...searched.repositories, ...tracking.observations]);

  return {
    output: { date, repositories },
    stats: {
      queries: queries.length,
      rawResults,
      searched: searched.repositories.length,
      tracking: tracking.stats,
      total: repositories.length,
    },
  };
}

async function trackRegistered(
  found: RepositoryObservation[],
  registered: RepositoryId[],
  config: DiscoveryConfig,
  adapter: GitHubReadAdapter,
  log: (m: string) => void,
): Promise<{ observations: RepositoryObservation[]; stats: DiscoverStats['tracking'] }> {
  const foundKeys = new Set(found.map((r) => r.repository.toLowerCase()));
  const seen = new Set<string>();
  const candidates = registered
    .filter((id) => {
      const k = id.toLowerCase();
      if (foundKeys.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const enabled = config.tracking.registered;
  const toCheck = enabled ? candidates.slice(0, config.tracking.max_lookups) : [];
  const stats: DiscoverStats['tracking'] = {
    candidates: candidates.length,
    checked: toCheck.length,
    added: [],
    missing: [],
    archived: [],
    skippedOverLimit: enabled ? candidates.length - toCheck.length : 0,
    stoppedByRateLimit: 0,
  };
  const observations: RepositoryObservation[] = [];
  if (toCheck.length) log(`tracking ${toCheck.length} registered repositories not found by search`);

  for (const [i, id] of toCheck.entries()) {
    let item;
    try {
      item = await adapter.getRepository(id);
    } catch (e) {
      // 한도 초과는 전체 실패 대신 추적만 중단 (검색 결과는 그대로 사용)
      if ((e as Error).name !== 'GitHubRateLimitError') throw e;
      stats.stoppedByRateLimit = toCheck.length - i;
      stats.checked = i;
      log(`tracking stopped by rate limit; ${stats.stoppedByRateLimit} repositories not checked`);
      break;
    }
    if (!item) stats.missing.push(id);
    else if (item.archived) stats.archived.push(id);
    else if (foundKeys.has(item.full_name.toLowerCase())) continue; // 이름 변경으로 이미 수집된 경우
    else {
      observations.push(toObservation(item));
      foundKeys.add(item.full_name.toLowerCase());
      stats.added.push(item.full_name);
    }
  }
  return { observations, stats };
}

const sortRepos = (items: RepositoryObservation[]) =>
  items.sort((a, b) => a.repository.toLowerCase().localeCompare(b.repository.toLowerCase()));
