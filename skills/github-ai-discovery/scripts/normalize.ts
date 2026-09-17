import type { GitHubRepoItem } from '../../../src/adapters/github.js';
import type { IsoDate, RepositoryObservation } from '../../../src/core/types.js';

/**
 * github-ai-discovery 의 결정적 후처리.
 * Claude 가 GitHub Search API(또는 다른 adapter)로 받은 원시 결과를
 * 표준 RepositoryObservation[] 으로 변환·필터링·중복 제거한다.
 * Ranking / Study 선정 / Markdown 작성은 하지 않는다.
 */

/** GitHub REST `GET /search/repositories` items[] 의 필요한 부분 */
export type GitHubSearchItem = GitHubRepoItem;

export interface NormalizeOptions {
  minimumStars: number;
  excludeArchived: boolean;
  excludeForks: boolean;
}

export interface DiscoveryOutput {
  date: IsoDate;
  repositories: RepositoryObservation[];
}

export function toObservation(item: GitHubSearchItem): RepositoryObservation {
  return {
    repository: item.full_name,
    url: item.html_url,
    description: item.description ?? null,
    stars: item.stargazers_count,
    topics: [...(item.topics ?? [])].sort(),
    language: item.language ?? null,
    pushedAt: item.pushed_at ?? null,
  };
}

export function normalizeSearchResults(
  date: IsoDate,
  resultsByTopic: Record<string, GitHubSearchItem[]>,
  opts: NormalizeOptions,
): DiscoveryOutput {
  const byKey = new Map<string, RepositoryObservation>();
  for (const topic of Object.keys(resultsByTopic).sort()) {
    for (const item of resultsByTopic[topic] ?? []) {
      if (item.stargazers_count < opts.minimumStars) continue;
      if (opts.excludeArchived && item.archived) continue;
      if (opts.excludeForks && item.fork) continue;
      const obs = toObservation(item);
      const key = obs.repository.toLowerCase();
      const prev = byKey.get(key);
      if (!prev) byKey.set(key, obs);
      else {
        // 같은 Repository 가 여러 topic 에서 나오면 topics 를 합치고 최신 stars 를 사용
        const topics = [...new Set([...(prev.topics ?? []), ...(obs.topics ?? [])])].sort();
        byKey.set(key, { ...(obs.stars >= prev.stars ? obs : prev), topics });
      }
    }
  }
  const repositories = [...byKey.values()].sort((a, b) =>
    a.repository.toLowerCase().localeCompare(b.repository.toLowerCase()),
  );
  return { date, repositories };
}
