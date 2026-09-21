import { readdir } from 'node:fs/promises';
import { studyBranch, studySlug } from '../core/slug.js';
import type { RepositoryId, StudyState } from '../core/types.js';
import type { StudyStateAdapter } from './github.js';
import type { GitHubRestClient } from './github-rest.js';

/**
 * 기존 Study 상태(studyExists / prOpen) 를 채우는 adapter 들.
 * - LocalStudyStateAdapter: studies/{slug}.md 파일이 있으면 studyExists
 * - PullRequestStudyStateAdapter: 이 저장소의 열린 PR 중 head branch 가 study/{slug} 면 prOpen
 * - CompositeStudyStateAdapter: 여러 adapter 결과를 OR 로 합친다
 *
 * Registry 의 studyability(notStudyable) 는 core/registry.ts 의 studyStatesFromRegistry 가 담당한다.
 * 선정기(study-candidate-selector) 는 이 값들을 skip_if 규칙(study_exists / pr_open) 에 사용한다.
 */

const EMPTY: StudyState = { studyExists: false, prOpen: false };

/** owner/name → 소문자 slug. 규칙에 맞지 않는 이름이면 null (판정 불가 → 미작성으로 취급) */
export function safeStudySlug(repository: RepositoryId): string | null {
  try {
    return studySlug(repository);
  } catch {
    return null;
  }
}

/** studies/ 폴더의 Study 파일 slug 목록 (*.md, 확장자 제외). 폴더가 없으면 빈 집합 */
export async function listStudySlugs(studiesDir: string): Promise<Set<string>> {
  let files: string[];
  try {
    files = await readdir(studiesDir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw e;
  }
  return new Set(files.filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -'.md'.length).toLowerCase()));
}

export class LocalStudyStateAdapter implements StudyStateAdapter {
  constructor(private readonly studiesDir: string) {}

  async getStudyStates(repositories: RepositoryId[]): Promise<Record<RepositoryId, StudyState>> {
    const slugs = await listStudySlugs(this.studiesDir);
    const out: Record<RepositoryId, StudyState> = {};
    for (const r of repositories) {
      const slug = safeStudySlug(r);
      out[r] = { studyExists: slug !== null && slugs.has(slug), prOpen: false };
    }
    return out;
  }
}

interface PullRequestItem {
  head?: { ref?: string };
}

const PULLS_PER_PAGE = 100;

/** GET /repos/{owner}/{name}/pulls?state=open 만 사용한다 (GitHubRestClient.request 주입) */
export type PullRequestReader = Pick<GitHubRestClient, 'request'>;

export class PullRequestStudyStateAdapter implements StudyStateAdapter {
  /**
   * @param client          GitHub REST 클라이언트
   * @param studyRepository Study 파일·PR 이 올라가는 저장소 (예: sonic0506/ai-github-study-automation)
   */
  constructor(
    private readonly client: PullRequestReader,
    private readonly studyRepository: RepositoryId,
  ) {
    const parts = studyRepository.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`Invalid study repository: "${studyRepository}"`);
  }

  async getStudyStates(repositories: RepositoryId[]): Promise<Record<RepositoryId, StudyState>> {
    const branches = await this.openStudyBranches();
    const out: Record<RepositoryId, StudyState> = {};
    for (const r of repositories) {
      const slug = safeStudySlug(r);
      out[r] = { studyExists: false, prOpen: slug !== null && branches.has(studyBranch(r)) };
    }
    return out;
  }

  /** 열린 PR 의 head branch 중 study/ 로 시작하는 것 (소문자) */
  async openStudyBranches(): Promise<Set<string>> {
    const [owner = '', name = ''] = this.studyRepository.split('/');
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls`;
    const out = new Set<string>();
    for (let page = 1; ; page++) {
      const items = await this.client.request<PullRequestItem[]>(path, {
        params: { state: 'open', per_page: PULLS_PER_PAGE, page },
      });
      if (!items || items.length === 0) break;
      for (const pr of items) {
        const ref = pr.head?.ref;
        if (typeof ref === 'string' && ref.startsWith('study/')) out.add(ref.toLowerCase());
      }
      if (items.length < PULLS_PER_PAGE) break;
    }
    return out;
  }
}

/** 여러 adapter 의 결과를 OR 로 합친다 (하나라도 true 면 true). 저장소 이름은 대소문자 무시 */
export function mergeStudyStates(...sources: Record<RepositoryId, StudyState>[]): Record<RepositoryId, StudyState> {
  const out: Record<RepositoryId, StudyState> = {};
  const keyOf = new Map<string, RepositoryId>();
  for (const source of sources) {
    for (const [id, s] of Object.entries(source)) {
      const k = id.toLowerCase();
      const existing = keyOf.get(k);
      if (existing === undefined) {
        keyOf.set(k, id);
        out[id] = { ...EMPTY, ...s };
        continue;
      }
      const prev = out[existing] ?? EMPTY;
      out[existing] = {
        studyExists: prev.studyExists || s.studyExists,
        prOpen: prev.prOpen || s.prOpen,
        ...(prev.notStudyable || s.notStudyable ? { notStudyable: true } : {}),
      };
    }
  }
  return out;
}

export class CompositeStudyStateAdapter implements StudyStateAdapter {
  constructor(private readonly adapters: StudyStateAdapter[]) {}

  async getStudyStates(repositories: RepositoryId[]): Promise<Record<RepositoryId, StudyState>> {
    const results = await Promise.all(this.adapters.map((a) => a.getStudyStates(repositories)));
    return mergeStudyStates(...results);
  }
}
