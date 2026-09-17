import {
  STUDYABLE_CATEGORIES,
  type IsoDate,
  type IsoDateTime,
  type RepositoryId,
  type RepositoryInfo,
  type Studyability,
  type StudyabilityUpdate,
  type StudyState,
} from './types.js';

/**
 * Registry: 지금까지 발견한 모든 Repository 목록 (data/registry.json).
 * - firstSeen: 처음 발견한 날짜 → isNew 판단 기준
 * - lastSeen : 마지막으로 수집된 날짜
 */
export interface RegistryEntry {
  firstSeen: IsoDate;
  lastSeen: IsoDate;
  /** github-researcher 의 Study 적합성 판정 (없으면 아직 판정 안 함) */
  studyability?: Studyability;
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

function findId(registry: Registry, repository: RepositoryId): RepositoryId | undefined {
  const k = key(repository);
  return Object.keys(registry.repositories).find((id) => key(id) === k);
}

export function assertStudyability(s: Studyability): void {
  const studyableCategory = (STUDYABLE_CATEGORIES as readonly string[]).includes(s.category);
  if (studyableCategory !== s.studyable) {
    throw new Error(`category "${s.category}" requires studyable=${studyableCategory}`);
  }
  if (!s.reason.trim()) throw new Error('studyability.reason is required');
}

/**
 * Study 적합성 판정을 Registry 에 반영한다 (입력 불변).
 * Registry 에 없는 저장소는 오류 (수집된 저장소만 판정 대상).
 * studyability=null 이면 판정을 지운다 (다시 판정 대상이 됨).
 */
export function applyStudyability(
  registry: Registry,
  updates: { repository: RepositoryId; studyability: Studyability | null }[],
  updatedAt: IsoDateTime,
): Registry {
  const repositories: Record<RepositoryId, RegistryEntry> = {};
  for (const [id, e] of Object.entries(registry.repositories)) repositories[id] = { ...e };
  for (const u of updates) {
    const id = findId(registry, u.repository);
    if (!id) throw new Error(`Not in registry: ${u.repository}`);
    const entry = repositories[id]!;
    if (u.studyability === null) delete entry.studyability;
    else {
      assertStudyability(u.studyability);
      entry.studyability = { ...u.studyability };
    }
  }
  return { version: 1, updatedAt, repositories };
}

export const applyStudyabilityUpdates = (registry: Registry, updates: StudyabilityUpdate[], updatedAt: IsoDateTime) =>
  applyStudyability(registry, updates, updatedAt);

/** Registry 판정을 selector 입력(studyStates)으로 변환. Study/PR 존재 여부는 별도 adapter 가 채운다 */
export function studyStatesFromRegistry(registry: Registry): Record<RepositoryId, StudyState> {
  const out: Record<RepositoryId, StudyState> = {};
  for (const [id, e] of Object.entries(registry.repositories)) {
    if (e.studyability && !e.studyability.studyable) out[id] = { studyExists: false, prOpen: false, notStudyable: true };
  }
  return out;
}
