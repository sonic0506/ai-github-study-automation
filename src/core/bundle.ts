import { createHash } from 'node:crypto';
import type { SchemaValidator } from './schema.js';
import type {
  Baseline,
  DailyBundle,
  DailyReport,
  IsoDate,
  IsoDateTime,
  RepositoryInfo,
  RankingResult,
  StudyDraft,
  StudyQueue,
  StudyabilityUpdate,
} from './types.js';

/**
 * DailyBundle 조립·검증 (순수 함수).
 * Cowork 가 만든 조각들을 하나의 JSON 으로 묶어 GitHub Actions 로 넘긴다.
 */

export interface BundleParts {
  date: IsoDate;
  runId: string;
  generatedAt: IsoDateTime;
  baseline: Baseline | null;
  repositories: RepositoryInfo[];
  rankings: RankingResult;
  studyQueue: StudyQueue;
  dailyReport: DailyReport;
  studyDrafts?: StudyDraft[];
  studyabilityUpdates?: StudyabilityUpdate[];
}

export function buildDailyBundle(parts: BundleParts): DailyBundle {
  const bundle: DailyBundle = {
    version: 1,
    runId: parts.runId,
    date: parts.date,
    generatedAt: parts.generatedAt,
    baseline: parts.baseline,
    repositories: parts.repositories,
    rankings: parts.rankings,
    studyQueue: parts.studyQueue,
    dailyReport: parts.dailyReport,
    studyDrafts: parts.studyDrafts ?? [],
    studyabilityUpdates: parts.studyabilityUpdates ?? [],
  };
  assertBundleConsistency(bundle);
  return bundle;
}

/** 스키마로 잡히지 않는 관계를 확인한다 (날짜 일치, 중복 branch/path, 선정 후보와 초안 대응) */
export function assertBundleConsistency(bundle: DailyBundle): void {
  const problems = checkBundleConsistency(bundle);
  if (problems.length) throw new Error(`Inconsistent daily bundle:\n  ${problems.join('\n  ')}`);
}

export function checkBundleConsistency(bundle: DailyBundle): string[] {
  const problems: string[] = [];
  if (bundle.studyQueue.date !== bundle.date) {
    problems.push(`studyQueue.date (${bundle.studyQueue.date}) must equal date (${bundle.date})`);
  }
  if (!bundle.dailyReport.path.includes(bundle.date)) {
    problems.push(`dailyReport.path (${bundle.dailyReport.path}) must contain the date`);
  }
  if (bundle.baseline && bundle.baseline.date >= bundle.date) {
    problems.push(`baseline.date (${bundle.baseline.date}) must be before date (${bundle.date})`);
  }

  const selected = new Set(
    bundle.studyQueue.candidates.filter((c) => c.status === 'selected').map((c) => c.repository.toLowerCase()),
  );
  const seenPaths = new Set<string>();
  const seenBranches = new Set<string>();
  for (const draft of bundle.studyDrafts) {
    const key = draft.repository.toLowerCase();
    if (!selected.has(key)) problems.push(`studyDrafts: ${draft.repository} is not selected in the study queue`);
    if (seenPaths.has(draft.path)) problems.push(`studyDrafts: duplicate path ${draft.path}`);
    if (seenBranches.has(draft.branch)) problems.push(`studyDrafts: duplicate branch ${draft.branch}`);
    seenPaths.add(draft.path);
    seenBranches.add(draft.branch);
  }
  if (bundle.studyDrafts.length > bundle.studyQueue.maxDailyDrafts) {
    problems.push(`studyDrafts: ${bundle.studyDrafts.length} drafts exceed maxDailyDrafts (${bundle.studyQueue.maxDailyDrafts})`);
  }

  const known = new Set(bundle.repositories.map((r) => r.repository.toLowerCase()));
  for (const u of bundle.studyabilityUpdates) {
    if (!known.has(u.repository.toLowerCase())) {
      problems.push(`studyabilityUpdates: ${u.repository} is not in repositories`);
    }
  }
  return problems;
}

/** 스키마 + 관계 검사를 한 번에 */
export function validateBundle(bundle: unknown, validator: SchemaValidator): { ok: boolean; errors: string[] } {
  const schema = validator.validate('daily-bundle', bundle);
  const errors = schema.errors.map((e) => `schema: ${e}`);
  if (schema.valid) errors.push(...checkBundleConsistency(bundle as DailyBundle));
  return { ok: errors.length === 0, errors };
}

/** 전송 무결성 확인용 체크섬 (Actions 가 내려받은 뒤 비교) */
export const bundleChecksum = (bundle: DailyBundle): string =>
  createHash('sha256').update(serializeBundle(bundle)).digest('hex');

export const serializeBundle = (bundle: DailyBundle): string => `${JSON.stringify(bundle, null, 2)}\n`;
