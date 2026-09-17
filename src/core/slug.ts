import type { RepositoryId } from './types.js';

/**
 * Study 파일/브랜치 이름 규칙 (결정: 소문자 통일).
 *   acme-AI/Agent-Kit → acme-ai__agent-kit
 * GitHub 는 owner/name 대소문자를 구분하지 않으므로 소문자로 통일해 중복을 막는다.
 */
const PART_RE = /^[a-z0-9._-]+$/;

export function studySlug(repository: RepositoryId): string {
  const parts = repository.trim().toLowerCase().split('/');
  if (parts.length !== 2 || !parts.every((p) => PART_RE.test(p) && p !== '.' && p !== '..')) {
    throw new Error(`Invalid repository id for slug: "${repository}"`);
  }
  return parts.join('__');
}

export const studyBranch = (repository: RepositoryId): string => `study/${studySlug(repository)}`;

export const studyPath = (repository: RepositoryId): string => `studies/${studySlug(repository)}.md`;
