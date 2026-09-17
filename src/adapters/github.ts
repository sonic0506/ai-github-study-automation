import type { RepositoryId, StudyState } from '../core/types.js';

/**
 * 외부 서비스(GitHub) 의존부 인터페이스.
 * - 실제 구현: ./github-rest.ts (GitHubRestClient)
 * - 테스트/로컬 구현: FixtureGitHubAdapter (아래)
 */

/** GitHub REST 저장소 응답에서 사용하는 필드 (search/repositories items[] 와 GET /repos 공통) */
export interface GitHubRepoItem {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  topics?: string[];
  language?: string | null;
  pushed_at?: string | null;
  created_at?: string | null;
  archived?: boolean;
  fork?: boolean;
}

export interface GitHubReadAdapter {
  /** Search API. q 는 GitHub 검색 문법 (예: "topic:llm stars:>=100"). stars 내림차순, 최대 limit 개 */
  searchRepositories(q: string, limit: number): Promise<GitHubRepoItem[]>;
  /** 단일 저장소 조회. 없거나 접근 불가면 null */
  getRepository(fullName: RepositoryId): Promise<GitHubRepoItem | null>;
}

export interface StudyStateAdapter {
  getStudyStates(repositories: RepositoryId[]): Promise<Record<RepositoryId, StudyState>>;
}

/**
 * 메모리 데이터 기반 adapter.
 * 검색어의 topic / stars / created / pushed / archived / fork 한정자를 해석해 필터링한다.
 */
export class FixtureGitHubAdapter implements GitHubReadAdapter, StudyStateAdapter {
  readonly queries: string[] = [];
  readonly lookups: string[] = [];

  constructor(
    private readonly items: GitHubRepoItem[],
    private readonly studyStates: Record<RepositoryId, StudyState> = {},
  ) {}

  async searchRepositories(q: string, limit: number): Promise<GitHubRepoItem[]> {
    this.queries.push(q);
    const match = matcherFor(q);
    return this.items
      .filter(match)
      .sort((a, b) => b.stargazers_count - a.stargazers_count || a.full_name.localeCompare(b.full_name))
      .slice(0, limit);
  }

  async getRepository(fullName: RepositoryId): Promise<GitHubRepoItem | null> {
    this.lookups.push(fullName);
    const key = fullName.toLowerCase();
    return this.items.find((i) => i.full_name.toLowerCase() === key) ?? null;
  }

  async getStudyStates(repositories: RepositoryId[]): Promise<Record<RepositoryId, StudyState>> {
    const out: Record<RepositoryId, StudyState> = {};
    for (const r of repositories) out[r] = this.studyStates[r] ?? { studyExists: false, prOpen: false };
    return out;
  }
}

function matcherFor(q: string): (i: GitHubRepoItem) => boolean {
  const checks: ((i: GitHubRepoItem) => boolean)[] = [];
  for (const token of q.split(/\s+/).filter(Boolean)) {
    const [key, raw = ''] = token.split(/:(.*)/s);
    const gte = raw.startsWith('>=') ? raw.slice(2) : undefined;
    switch (key) {
      case 'topic':
        checks.push((i) => (i.topics ?? []).includes(raw));
        break;
      case 'stars':
        if (gte !== undefined) checks.push((i) => i.stargazers_count >= Number(gte));
        break;
      case 'created':
        if (gte !== undefined) checks.push((i) => (i.created_at ?? '').slice(0, 10) >= gte);
        break;
      case 'pushed':
        if (gte !== undefined) checks.push((i) => (i.pushed_at ?? '').slice(0, 10) >= gte);
        break;
      case 'archived':
        checks.push((i) => Boolean(i.archived) === (raw === 'true'));
        break;
      case 'fork':
        checks.push((i) => Boolean(i.fork) === (raw === 'true'));
        break;
      default:
        throw new Error(`FixtureGitHubAdapter: unsupported query token "${token}"`);
    }
  }
  return (i) => checks.every((c) => c(i));
}
