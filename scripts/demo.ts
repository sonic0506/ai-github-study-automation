/**
 * npm run demo [-- --input <analyzer-input.json>] [-- --selector <selector-input.json>]
 *
 * 테스트 fixture(또는 지정한 입력)로 결정적 파이프라인을 실제 실행하고
 *   1) 결과를 표로 출력하고
 *   2) JSON 을 output/demo/ 에 저장한다 (git 제외).
 *
 * 파이프라인: github-star-analyzer → study-candidate-selector
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadStudyPolicy } from '../src/core/config.js';
import { getProjectPaths } from '../src/core/paths.js';
import type { RankingEntry, RepositoryInfo, StudyCandidate } from '../src/core/types.js';
import { analyzeStars, type AnalyzerInput } from '../skills/github-star-analyzer/scripts/analyze.js';
import { selectStudyCandidates, type SelectorInput } from '../skills/study-candidate-selector/scripts/select.js';

const paths = getProjectPaths();

function argValue(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
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
  const analyzerInputPath = argValue('--input', join(paths.skills, 'github-star-analyzer/tests/fixtures/input.json'));
  const selectorInputPath = argValue('--selector', join(paths.skills, 'study-candidate-selector/tests/fixtures/input.json'));
  const outDir = join(paths.root, 'output', 'demo');

  const analyzerInput = JSON.parse(await readFile(analyzerInputPath, 'utf8')) as AnalyzerInput;
  const analysis = analyzeStars(analyzerInput);

  // history / studyStates 는 selector fixture 의 값을 재사용 (없으면 빈 값)
  const selectorExtra = JSON.parse(await readFile(selectorInputPath, 'utf8')) as Partial<SelectorInput>;
  const policy = await loadStudyPolicy(paths.config.studyPolicy);
  const queue = selectStudyCandidates({
    date: analysis.date,
    rankings: analysis.rankings,
    policy,
    history: selectorExtra.history ?? {},
    studyStates: selectorExtra.studyStates ?? {},
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
  if (Object.keys(selectorExtra.studyStates ?? {}).length || Object.keys(selectorExtra.history ?? {}).length) {
    console.log(`\n※ history / studyStates: ${relative(paths.root, selectorInputPath)}`);
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'analysis.json'), `${JSON.stringify(analysis, null, 2)}\n`);
  await writeFile(join(outDir, 'study-queue.json'), `${JSON.stringify(queue, null, 2)}\n`);
  console.log(`\nJSON 저장: ${relative(paths.root, outDir)}/analysis.json, study-queue.json\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
