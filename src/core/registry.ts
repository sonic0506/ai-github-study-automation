import type { IsoDate, IsoDateTime, RepositoryId, RepositoryInfo } from './types.js';

/**
 * Registry: 지금까지 발견한 모든 Repository 목록 (data/registry.json).
 * - firstSeen: 처음 발견한 날짜 → isNew 판단 기준
 * - lastSeen : 마지막으로 수집된 날짜
 */
export interface RegistryEntry {
  firstSeen: IsoDate;
  lastSeen: IsoDate;
}

export interface Registry {
  version: 1;
  updatedAt: IsoDateTime | null;
  repositories: Record<RepositoryId, RegistryEntry>;
}

export const emptyRegistry = (): Registry => ({ version: 1, updatedAt: null, repositories: {} });

const key = (id: RepositoryId) => id.toLowerCase();

export function registeredRepositories(registry: Registry): RepositoryId[] {
  return Object.keys(registry.repositories).sort((a, b) => key(a).localeCompare(key(b)));
}

export function firstSeenMap(registry: Registry): Record<RepositoryId, IsoDate> {
  return Object.fromEntries(Object.entries(registry.repositories).map(([id, e]) => [id, e.firstSeen]));
}

/**
 * 오늘 수집 결과를 Registry 에 반영한 새 객체를 반환한다 (입력 불변).
 * 기존 항목은 처음 등록된 표기(대소문자)와 firstSeen 을 유지한다.
 */
export function updateRegistry(
  registry: Registry,
  date: IsoDate,
  repositories: Pick<RepositoryInfo, 'repository'>[],
  updatedAt: IsoDateTime,
): Registry {
  const next: Record<RepositoryId, RegistryEntry> = {};
  const index = new Map<string, RepositoryId>();
  for (const [id, entry] of Object.entries(registry.repositories)) {
    next[id] = { ...entry };
    index.set(key(id), id);
  }
  for (const { repository } of repositories) {
    const existing = index.get(key(repository));
    if (existing) {
      const e = next[existing]!;
      if (date > e.lastSeen) e.lastSeen = date;
      if (date < e.firstSeen) e.firstSeen = date;
    } else {
      next[repository] = { firstSeen: date, lastSeen: date };
      index.set(key(repository), repository);
    }
  }
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => key(a).localeCompare(key(b))));
  return { version: 1, updatedAt, repositories: sorted };
}
