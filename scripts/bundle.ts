/**
 * npm run bundle [-- --date YYYY-MM-DD] [--drafts <dir>] [--out <file>]
 *
 * output/demo 의 분석·Queue·리포트와 Study 초안을 모아 DailyBundle 을 만든다.
 *   기본 입력: output/demo/analysis.json, output/demo/study-queue.json, output/demo/daily-report.md
 *   초안: --drafts 로 지정한 디렉터리의 *.json (study-writer 출력)
 *   출력: output/bundle/{date}.json  (스키마 + 관계 검사 통과분만)
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { buildDailyBundle, bundleChecksum, serializeBundle } from '../src/core/bundle.js';
import { loadReportConfig } from '../src/core/config.js';
import { loadEnv, todayIn } from '../src/core/env.js';
import { writeJson } from '../src/core/local-store.js';
import { getProjectPaths } from '../src/core/paths.js';
import { loadValidator } from '../src/core/schema.js';
import type { StudyDraft, StudyabilityUpdate } from '../src/core/types.js';

const env = loadEnv();
const paths = getProjectPaths();
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const readJson = async (p: string) => JSON.parse(await readFile(p, 'utf8'));

async function loadDrafts(dir: string | undefined): Promise<{ drafts: StudyDraft[]; updates: StudyabilityUpdate[] }> {
  if (!dir) return { drafts: [], updates: [] };
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const drafts: StudyDraft[] = [];
  const updates: StudyabilityUpdate[] = [];
  for (const f of files) {
    const item = await readJson(join(dir, f));
    if (item.markdown) drafts.push(item as StudyDraft);
    else if (item.studyability) updates.push({ repository: item.repository, studyability: item.studyability });
  }
  return { drafts, updates };
}

async function main(): Promise<void> {
  const demo = join(paths.output, 'demo');
  const analysis = await readJson(join(demo, 'analysis.json'));
  const studyQueue = await readJson(join(demo, 'study-queue.json'));
  const markdown = await readFile(join(demo, 'daily-report.md'), 'utf8');
  const date = arg('--date') ?? analysis.date ?? todayIn(env.AGS_TIMEZONE);
  const reportConfig = await loadReportConfig(paths.config.report);
  const { drafts, updates } = await loadDrafts(arg('--drafts'));

  const bundle = buildDailyBundle({
    date,
    runId: `${date}-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    baseline: analysis.baseline,
    repositories: analysis.repositories,
    rankings: analysis.rankings,
    studyQueue,
    dailyReport: { path: reportConfig.report_path.replace('{date}', date), markdown },
    studyDrafts: drafts,
    studyabilityUpdates: updates,
  });

  (await loadValidator(paths.schemas)).assert('daily-bundle', bundle);

  const out = arg('--out') ?? join(paths.output, 'bundle', `${date}.json`);
  await writeJson(out, bundle);
  const serialized = serializeBundle(bundle);
  console.log(`\nDailyBundle ${date}`);
  console.log(`  저장소 ${bundle.repositories.length}개 · Study 초안 ${bundle.studyDrafts.length}개 · 적합성 판정 ${bundle.studyabilityUpdates.length}건`);
  console.log(`  크기 ${(Buffer.byteLength(serialized) / 1024).toFixed(1)} KB · sha256 ${bundleChecksum(bundle).slice(0, 16)}…`);
  console.log(`  저장: ${relative(paths.root, out)}`);
  console.log(`\n다음: npm run handoff -- --bundle ${relative(paths.root, out)} --repo <owner/name>\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
