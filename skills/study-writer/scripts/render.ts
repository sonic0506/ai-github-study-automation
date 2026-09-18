import { studyBranch, studyPath } from '../../../src/core/slug.js';
import { renderTemplate } from '../../../src/core/template.js';
import type { IsoDate, RepositoryInfo, ResearchNote, StudyCandidate, StudyDraft } from '../../../src/core/types.js';

/**
 * study-writer 핵심 로직 (순수 함수).
 * 스타일이 적용된 Research Note 를 Study Markdown + PR 본문으로 조립한다.
 * - 문장은 Note 의 것을 그대로 쓴다 (문체 가공은 my-writing-style 에서 끝났다)
 * - 출처는 각주([^s1])로 달고 마지막에 목록으로 모은다
 * - branch/path 는 src/core/slug.ts 규칙 (소문자 owner__name)
 */

export interface StudyRenderInput {
  date: IsoDate;
  note: ResearchNote;
  repository: Pick<RepositoryInfo, 'repository' | 'url' | 'stars' | 'delta24h'>;
  candidate: Pick<StudyCandidate, 'priority' | 'reasons'>;
  templates: { study: string; pr: string };
}

const num = (n: number) => n.toLocaleString('en-US');

/** 출처 id 목록 → 각주 표기 (`[^s1][^s2]`) */
export const footnoteRefs = (ids: string[] | undefined): string => (ids ?? []).map((id) => `[^${id}]`).join('');

const sourceLabel = (s: { title?: string | null; type: string }) => s.title?.trim() || s.type;

const withRefs = <T extends { sourceIds?: string[] }>(item: T) => ({ ...item, refs: footnoteRefs(item.sourceIds) });

/** 있는 섹션에만 01, 02 … 번호를 매긴다 (빈 섹션 때문에 번호가 건너뛰지 않게) */
export function numberSections(present: Record<string, boolean>): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 0;
  for (const [key, exists] of Object.entries(present)) {
    if (exists) out[key] = String(++n).padStart(2, '0');
  }
  return out;
}

export function buildStudyView(input: StudyRenderInput): Record<string, unknown> {
  const { note, repository, candidate } = input;
  const sources = (note.sources ?? []).map((s) => ({ ...s, label: sourceLabel(s) }));
  const used = new Set(
    [
      ...(note.architecture ?? []),
      ...(note.keyFeatures ?? []),
      ...(note.recentReleases ?? []),
      ...(note.communitySignals ?? []),
      ...(note.facts ?? []),
      ...(note.limitations ?? []),
      ...(note.gettingStarted ? [note.gettingStarted] : []),
    ].flatMap((i) => i.sourceIds ?? []),
  );

  const n = numberSections({
    problem: true,
    architecture: (note.architecture ?? []).length > 0,
    features: (note.keyFeatures ?? []).length > 0,
    gettingStarted: Boolean(note.gettingStarted),
    releases: (note.recentReleases ?? []).length > 0,
    community: (note.communitySignals ?? []).length > 0,
    limitations: (note.limitations ?? []).length > 0,
    openQuestions: (note.openQuestions ?? []).length > 0,
  });

  return {
    n,
    repository: repository.repository,
    url: repository.url,
    stars: num(repository.stars),
    deltaLabel: repository.delta24h === null ? '' : `24h ${repository.delta24h > 0 ? '+' : ''}${num(repository.delta24h)}`,
    date: input.date,
    researchedAt: note.researchedAt,
    category: note.studyability.category,
    priority: candidate.priority.toFixed(2),
    reasons: candidate.reasons,
    summary: note.summary ?? '',
    problem: note.problem ?? '',
    facts: (note.facts ?? []).map(withRefs),
    architecture: (note.architecture ?? []).map(withRefs),
    hasArchitecture: (note.architecture ?? []).length > 0,
    keyFeatures: (note.keyFeatures ?? []).map(withRefs),
    hasFeatures: (note.keyFeatures ?? []).length > 0,
    gettingStarted: note.gettingStarted
      ? { ...withRefs(note.gettingStarted), language: note.gettingStarted.language || 'text' }
      : null,
    recentReleases: (note.recentReleases ?? []).map(withRefs),
    hasReleases: (note.recentReleases ?? []).length > 0,
    communitySignals: (note.communitySignals ?? []).map(withRefs),
    hasCommunity: (note.communitySignals ?? []).length > 0,
    limitations: (note.limitations ?? []).map(withRefs),
    hasLimitations: (note.limitations ?? []).length > 0,
    openQuestions: note.openQuestions ?? [],
    hasOpenQuestions: (note.openQuestions ?? []).length > 0,
    sources,
    footnotes: sources.filter((s) => used.has(s.id)),
    sourceCount: sources.length,
    sourceTypes: [...new Set(sources.map((s) => s.type))].sort().join(', ') || '-',
    factCount: (note.facts ?? []).length,
  };
}

export function renderStudyDraft(input: StudyRenderInput): StudyDraft {
  const { note, repository } = input;
  if (note.repository.toLowerCase() !== repository.repository.toLowerCase()) {
    throw new Error(`note.repository (${note.repository}) must match repository (${repository.repository})`);
  }
  if (!note.studyability.studyable) {
    throw new Error(`${note.repository} is marked not studyable (${note.studyability.category})`);
  }
  if (!note.summary || !note.problem || (note.facts ?? []).length === 0) {
    throw new Error('Research note is missing summary, problem or facts');
  }

  const view = buildStudyView(input);
  return {
    repository: repository.repository,
    branch: studyBranch(repository.repository),
    path: studyPath(repository.repository),
    title: `[Study] ${repository.repository}`,
    markdown: renderTemplate(input.templates.study, view).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
    prBody: renderTemplate(input.templates.pr, view).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
  };
}
