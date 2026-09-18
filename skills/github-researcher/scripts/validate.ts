import type { SchemaValidator } from '../../../src/core/schema.js';
import type { ResearchNote } from '../../../src/core/types.js';

/**
 * Research Note 검사 (순수 함수).
 * 1. JSON Schema (research-note.schema.json)
 * 2. 출처 참조 무결성 — 모든 sourceIds 가 sources 에 존재하는지, id 가 중복되지 않는지
 * 3. 권고 사항(warnings) — 참조되지 않은 출처, README 외 출처 부족, 사실 개수 등
 */

export interface CheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    facts: number;
    sources: number;
    referencedSources: number;
    sourceTypes: string[];
  };
}

interface Sourced {
  sourceIds?: string[];
}

const MIN_FACTS = 3;

/** sourceIds 를 가진 모든 항목을 경로와 함께 모은다 */
export function collectSourceRefs(note: ResearchNote): { path: string; ids: string[] }[] {
  const refs: { path: string; ids: string[] }[] = [];
  const add = (path: string, item: Sourced | null | undefined) => {
    if (item?.sourceIds) refs.push({ path, ids: item.sourceIds });
  };
  const addAll = (path: string, items: Sourced[] | undefined) =>
    (items ?? []).forEach((item, i) => add(`${path}[${i}]`, item));

  addAll('architecture', note.architecture);
  addAll('keyFeatures', note.keyFeatures);
  add('gettingStarted', note.gettingStarted);
  addAll('recentReleases', note.recentReleases);
  addAll('communitySignals', note.communitySignals);
  addAll('facts', note.facts);
  addAll('limitations', note.limitations);
  return refs;
}

export function checkResearchNote(note: ResearchNote, validator: SchemaValidator): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const schema = validator.validate('research-note', note);
  errors.push(...schema.errors.map((e) => `schema: ${e}`));

  const sources = note.sources ?? [];
  const ids = new Set<string>();
  for (const s of sources) {
    if (ids.has(s.id)) errors.push(`sources: duplicate id "${s.id}"`);
    ids.add(s.id);
  }

  const referenced = new Set<string>();
  for (const { path, ids: refIds } of collectSourceRefs(note)) {
    for (const id of refIds) {
      if (!ids.has(id)) errors.push(`${path}: unknown source id "${id}"`);
      else referenced.add(id);
    }
  }

  const studyable = note.studyability?.studyable !== false;
  if (studyable) {
    for (const s of sources) if (!referenced.has(s.id)) warnings.push(`sources: "${s.id}" is never referenced`);
    if ((note.facts?.length ?? 0) < MIN_FACTS) warnings.push(`facts: fewer than ${MIN_FACTS} verifiable claims`);
    if (!sources.some((s) => s.type !== 'readme')) warnings.push('sources: only README was used');
    if (!note.gettingStarted) warnings.push('gettingStarted: missing (설치·실행 방법을 찾지 못했다면 openQuestions 에 남길 것)');
  } else if (sources.length === 0 && (note.facts?.length ?? 0) > 0) {
    errors.push('facts: present without sources');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      facts: note.facts?.length ?? 0,
      sources: sources.length,
      referencedSources: referenced.size,
      sourceTypes: [...new Set(sources.map((s) => s.type))].sort(),
    },
  };
}
