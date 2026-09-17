/**
 * npm run demo [-- --input <analyzer-input.json>] [--selector <selector-input.json>] [--save [--force]]
 *
 * 테스트 fixture(또는 지정한 입력)로 결정적 파이프라인을 실제 실행하고
 *   1) 결과를 표로 출력하고
 *   2) JSON 을 output/demo/ 에 저장한다 (git 제외).
 *   3) --save: 오늘 Snapshot 과 갱신된 Registry 를 AGS_DATA_DIR 에 저장 (다음 실행의 비교 기준)
 *      AGS_DATA_DIR 이 운영 폴더(data)이면 --force 가 있어야 저장한다.
 *
 * 파이프라인: github-star-analyzer → study-candidate-selector
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadStudyPolicy } from '../src/core/config.js';
import { loadEnv } from '../src/core/env.js';
import { readRegistry, writeJson, writeSnapshot } from '../src/core/local-store.js';
import { getProjectPaths } from '../src/core/paths.js';
import { studyStatesFromRegistry, updateRegistry } from '../src/core/registry.js';
import type { RankingEntry, RepositoryInfo, StudyCandidate } from '../src/core/types.js';
import { analyzeStars, type AnalyzerInput } from '../skills/github-star-analyzer/scripts/analyze.js';
import { selectStudyCandidates, type SelectorInput } from '../skills/study-candidate-selector/scripts/select.js';

loadEnv();
const paths = getProjectPaths();

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : undefined;
}

const fmt = (n: number | null) => (n === null ? '-' : n.toLocaleString('en-US'));
const signed = (n: number | null) => (n === null ? 'NEW' : `${n > 0 ? '+' : ''}${n.toLocaleString('en-US')}`);

function table(headers: string[], rows: string[][], align: ('l' | 'r')[]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (align[i] === 'r' ? c.padStart(widths[i]!) : c.padEnd(widths[i]!)))
      .join('  ')
      .trimEnd();
  const out = [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];
  return rows.length ? out.join('\n') : `${out.slice(0, 2).join('\n')}\n(없음)`;
}

function section(title: string, body: string): void {
  console.log(`\n■ ${title}\n${body}`);
}

const rankRows = (items: RankingEntry[]) =>
  items.map((r) => [String(r.rank), r.repository, fmt(r.stars), signed(r.delta24h), r.isNew ? 'Y' : '']);

const newRows = (items: RepositoryInfo[]) => items.map((r) => [r.repository, fmt(r.stars), r.firstSeen]);

const queueRows = (items: StudyCandidate[]) =>
  items.map((c) => [c.status, c.priority.toFixed(2), c.repository, c.reasons.join(' | ')]);

async function main(): Promise<void> {
  const customInput = argValue('--input');
  const analyzerInputPath = customInput ?? join(paths.skills, 'github-star-analyzer/tests/fixtures/input.json');
  // --input 을 직접 준 경우 fixture 의 history/studyStates 는 쓰지 않는다
  const selectorInputPath =
    argValue('--selector') ?? (customInput ? undefined : join(paths.skills, 'study-candidate-selector/tests/fixtures/input.json'));
  const outDir = join(paths.output, 'demo');

  const analyzerInput = JSON.parse(await readFile(analyzerInputPath, 'utf8')) as AnalyzerInput;
  const analysis = analyzeStars(analyzerInput);

  const selectorExtra: Partial<SelectorInput> = selectorInputPath
    ? (JSON.parse(await readFile(selectorInputPath, 'utf8')) as Partial<SelectorInput>)
    : {};
  const policy = await loadStudyPolicy(paths.config.studyPolicy);
  // 실데이터 실행이면 Registry 의 Study 적합성 판정을 반영한다
  const registryStates = customInput ? studyStatesFromRegistry(await readRegistry(paths.data.registry)) : {};
  const queue = selectStudyCandidates({
    date: analysis.date,
    rankings: analysis.rankings,
    policy,
    history: selectorExtra.history ?? {},
    studyStates: { ...registryStates, ...(selectorExtra.studyStates ?? {}) },
  });

  console.log(`\nAI GitHub Study — demo run (${analysis.date})`);
  console.log(`입력: ${relative(paths.root, analyzerInputPath)}`);
  const b = analysis.baseline;
  console.log(
    `비교 기준: ${b ? `${b.date} (${b.gapDays === 1 ? '전날' : `${b.gapDays}일 전`})` : '없음 (첫 실행)'}` +
      ` · 수집 ${analysis.repositories.length}개 · 신규 ${analysis.rankings.newlyDiscovered.length}개`,
  );

  const rankHeaders = ['#', 'Repository', 'Stars', 'Δ', 'New'];
  const rankAlign: ('l' | 'r')[] = ['r', 'l', 'r', 'r', 'l'];
  section('Total Stars TOP 10', table(rankHeaders, rankRows(analysis.rankings.totalStarsTop10), rankAlign));
  section('24h Growth TOP 10', table(rankHeaders, rankRows(analysis.rankings.growth24hTop10), rankAlign));
  section('Newly Discovered', table(['Repository', 'Stars', 'First seen'], newRows(analysis.rankings.newlyDiscovered), ['l', 'r', 'l']));
  section(
    `Study Queue (최대 ${queue.maxDailyDrafts}개 선정)`,
    table(['Status', 'Priority', 'Repository', 'Reasons'], queueRows(queue.candidates), ['l', 'r', 'l', 'l']),
  );
  if (selectorInputPath) console.log(`\n※ history / studyStates: ${relative(paths.root, selectorInputPath)}`);

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'analysis.json'), `${JSON.stringify(analysis, null, 2)}\n`);
  await writeFile(join(outDir, 'study-queue.json'), `${JSON.stringify(queue, null, 2)}\n`);
  console.log(`\nJSON 저장: ${relative(paths.root, outDir)}/analysis.json, study-queue.json`);

  if (process.argv.includes('--save')) await saveState(analysis);
  console.log('');
}

async function saveState(analysis: ReturnType<typeof analyzeStars>): Promise<void> {
  const rel = (p: string) => relative(paths.root, p);
  const isProductionData = paths.data.dir === join(paths.root, 'data');
  if (isProductionData && !process.argv.includes('--force')) {
    console.log(
      `\n✗ 저장 안 함: 데이터 위치가 운영 폴더(data/)입니다. .env 에 AGS_DATA_DIR=output/local-data 를 설정하거나 --force 를 붙이세요.`,
    );
    process.exitCode = 1;
    return;
  }
  const snapshotPath = await writeSnapshot(paths.data.snapshots, analysis.snapshot);
  const registry = updateRegistry(await readRegistry(paths.data.registry), analysis.date, analysis.repositories, new Date().toISOString());
  await writeJson(paths.data.registry, registry);
  console.log(`Snapshot 저장: ${rel(snapshotPath)}`);
  console.log(`Registry 갱신: ${rel(paths.data.registry)} (총 ${Object.keys(registry.repositories).length}개)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
