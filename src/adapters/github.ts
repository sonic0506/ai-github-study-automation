import type { RepositoryId, RepositoryObservation, StudyState } from '../core/types.js';

/**
 * 외부 서비스(GitHub) 의존부를 adapter 인터페이스로 분리한다.
 * Phase 0~2 에서는 Fixture 구현만 제공하며, 실제 REST/GraphQL 구현은 다음 Phase 에서 추가한다.
 */

export interface RepositorySearchQuery {
  topic: string;
  minimumStars: number;
  limit: number;
  pushedAfter?: string;
  excludeArchived?: boolean;
  excludeForks?: boolean;
}

export interface GitHubDiscoveryAdapter {
  searchByTopic(query: RepositorySearchQuery): Promise<RepositoryObservation[]>;
}

export interface StudyStateAdapter {
  getStudyStates(repositories: RepositoryId[]): Promise<Record<RepositoryId, StudyState>>;
}

/** 테스트/로컬용: 메모리 데이터 기반 adapter */
export class FixtureGitHubAdapter implements GitHubDiscoveryAdapter, StudyStateAdapter {
  constructor(
    private readonly byTopic: Record<string, RepositoryObservation[]>,
    private readonly studyStates: Record<RepositoryId, StudyState> = {},
  ) {}

  async searchByTopic(q: RepositorySearchQuery): Promise<RepositoryObservation[]> {
    return (this.byTopic[q.topic] ?? [])
      .filter((r) => r.stars >= q.minimumStars)
      .sort((a, b) => b.stars - a.stars || a.repository.localeCompare(b.repository))
      .slice(0, q.limit);
  }

  async getStudyStates(repositories: RepositoryId[]): Promise<Record<RepositoryId, StudyState>> {
    const out: Record<RepositoryId, StudyState> = {};
    for (const r of repositories) out[r] = this.studyStates[r] ?? { studyExists: false, prOpen: false };
    return out;
  }
}
