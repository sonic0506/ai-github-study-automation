/**
 * npm run daily [-- --date YYYY-MM-DD] [--dry-run]
 *
 * 매일 실행하는 결정적 파이프라인 (GitHub Actions 용).
 *   수집 → Star 분석 → Study 후보 선정 → Daily Report 렌더링 → 저장소 파일 반영
 *
 * 쓰는 파일: {AGS_DATA_DIR}/snapshots/{date}.json, registry.json, study-queue.json,
 *           reports/daily/{date}.md
 * 부가 출력: output/bundle/{date}.json (DailyBundle), output/notify/{date}.md (알림 본문)
 *
 * Study 초안은 포함하지 않는다 (Claude 가 필요한 단계라 Cowork 에서 따로 작성).
 */
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { GitHubRestClient } from '../src/adapters/github-rest.js';
import { applyBundle } from '../src/core/apply-bundle.js';
import { buildDailyBundle } from '../src/core/bundle.js';
import { loadDiscoveryConfig, loadReportConfig, loadStudyPolicy } from '../src/core/config.js';
import { loadEnv, maskToken, todayIn } from '../src/core/env.js';
import { listSnapshotDates, readRegistry, readSnapshot, writeJson } from '../src/core/local-store.js';
import { getProjectPaths } from '../src/core/paths.js';
import { firstSeenMap, registeredRepositories, studyStatesFromRegistry } from '../src/core/registry.js';
import { loadValidator } from '../src/core/schema.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { discoverRepositories } from '../skills/github-ai-discovery/scripts/discover.js';
import { analyzeStars, selectBaselineDate } from '../skills/github-star-analyzer/scripts/analyze.js';
import { selectStudyCandidates, selectedRepositories } from '../skills/study-candidate-selector/scripts/select.js';
import { renderDailyReport } from '../skills/daily-report-writer/scripts/render.js';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const env = loadEnv();
  const paths = getProjectPaths();
  const rel = (p: string) => relative(paths.root, p);
  const date = arg('--date') ?? todayIn(env.AGS_TIMEZONE);
  const dryRun = process.argv.includes('--dry-run');

  const [discoveryConfig, policy, reportConfig] = await Promise.all([
    loadDiscoveryConfig(paths.config.discovery),
    loadStudyPolicy(paths.config.studyPolicy),
    loadReportConfig(paths.config.report),
  ]);

  console.log(`\nAI GitHub Daily — ${date} (${env.AGS_TIMEZONE})`);
  console.log(`  토큰 ${env.GITHUB_TOKEN ? maskToken(env.GITHUB_TOKEN) : '없음'} · 데이터 ${rel(paths.data.dir)}${dryRun ? ' · --dry-run' : ''}`);

  // 1. 수집
  const registry = await readRegistry(paths.data.registry);
  const client = new GitHubRestClient({
    token: env.GITHUB_TOKEN,
    baseUrl: env.GITHUB_API_BASE_URL,
    apiVersion: env.GITHUB_API_VERSION,
    timeoutMs: env.GITHUB_REQUEST_TIMEOUT_MS,
    maxRetries: env.GITHUB_MAX_RETRIES,
    maxRateLimitWaitMs: env.GITHUB_MAX_RATE_LIMIT_WAIT_MS,
    onEvent: (e) => {
      if (e.type !== 'request') console.log(`  ${e.type} ${e.path} ${Math.ceil(e.waitMs / 1000)}s`);
    },
  });
  const { output, stats } = await discoverRepositories({
    date,
    config: discoveryConfig,
    adapter: client,
    registered: registeredRepositories(registry),
  });
  console.log(`  수집 ${stats.total}개 (검색 ${stats.searched} + 추적 ${stats.tracking.added.length}${stats.excluded.length ? `, 제외 ${stats.excluded.length}` : ''}) · API ${client.requestCount}회`);

  // 2. 분석 → 선정 → 리포트
  const baselineDate = selectBaselineDate(await listSnapshotDates(paths.data.snapshots), date);
  const analysis = analyzeStars({
    date,
    current: output.repositories,
    previousSnapshot: baselineDate ? await readSnapshot(paths.data.snapshots, baselineDate) : null,
    firstSeen: firstSeenMap(registry),
    options: { topN: discoveryConfig.ranking.top_n, growthMinDelta: discoveryConfig.ranking.growth_min_delta },
  });
  const studyQueue = selectStudyCandidates({
    date,
    rankings: analysis.rankings,
    policy,
    studyStates: studyStatesFromRegistry(registry),
  });
  const report = renderDailyReport({
    date,
    baseline: analysis.baseline,
    rankings: analysis.rankings,
    studyQueue,
    repositoryCount: analysis.repositories.length,
    config: reportConfig,
    templates: {
      report: await readFile(join(paths.templates, 'daily-report.md'), 'utf8'),
      telegram: await readFile(join(paths.templates, 'telegram-daily.md'), 'utf8'),
    },
  });

  // 3. 번들 검증 → 파일 반영
  const bundle = buildDailyBundle({
    date,
    runId: `${date}-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    baseline: analysis.baseline,
    repositories: analysis.repositories,
    rankings: analysis.rankings,
    studyQueue,
    dailyReport: report.dailyReport,
  });
  (await loadValidator(paths.schemas)).assert('daily-bundle', bundle);

  await writeJson(join(paths.output, 'bundle', `${date}.json`), bundle);
  await mkdir(join(paths.output, 'notify'), { recursive: true });
  await writeFile(join(paths.output, 'notify', `${date}.md`), report.telegram.markdown);
  // 워크플로가 날짜를 몰라도 찾을 수 있도록 최신본을 따로 둔다
  await writeFile(join(paths.output, 'notify', 'latest.md'), report.telegram.markdown);

  if (dryRun) {
    console.log('\n--dry-run: 저장소 파일을 바꾸지 않았다.\n');
    return;
  }
  const applied = await applyBundle(bundle, { root: paths.root, dataDir: relative(paths.root, paths.data.dir) || 'data' });

  const selected = selectedRepositories(studyQueue);
  console.log(`
■ 결과
  비교 기준 ${analysis.baseline ? `${analysis.baseline.date} (${analysis.baseline.gapDays}일 전)` : '없음 (이전 스냅샷 없음)'}
  신규 ${analysis.rankings.newlyDiscovered.length}개 · Growth ${analysis.rankings.growth24hTop10.length}개 · Study 후보 ${selected.length}개${selected.length ? ` (${selected.join(', ')})` : ''}
  기록: ${applied.written.join(', ')}
  알림 본문: ${rel(join(paths.output, 'notify', `${date}.md`))}
`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
