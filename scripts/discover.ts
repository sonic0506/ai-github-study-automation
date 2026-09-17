/**
 * npm run discover [-- --date YYYY-MM-DD] [-- --dry-run]
 *
 * 실제 GitHub API 로 AI 저장소를 수집한다.
 *   output/discovery/{date}.json                 DiscoveryOutput (schema 검증)
 *   output/discovery/{date}.analyzer-input.json  star-analyzer 입력 (기준 Snapshot + Registry firstSeen 포함)
 *
 * 다음 단계:  npm run demo -- --input output/discovery/{date}.analyzer-input.json [--save]
 */
import { join, relative } from 'node:path';
import { GitHubRestClient } from '../src/adapters/github-rest.js';
import { loadDiscoveryConfig } from '../src/core/config.js';
import { loadEnv, maskToken, todayIn } from '../src/core/env.js';
import { listSnapshotDates, readRegistry, readSnapshot, writeJson } from '../src/core/local-store.js';
import { getProjectPaths } from '../src/core/paths.js';
import { firstSeenMap, registeredRepositories } from '../src/core/registry.js';
import { loadValidator } from '../src/core/schema.js';
import { selectBaselineDate } from '../skills/github-star-analyzer/scripts/analyze.js';
import { buildQueries, discoverRepositories } from '../skills/github-ai-discovery/scripts/discover.js';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const paths = getProjectPaths();
  const config = await loadDiscoveryConfig(paths.config.discovery);
  const date = argValue('--date') ?? todayIn(env.AGS_TIMEZONE);
  const rel = (p: string) => relative(paths.root, p);

  console.log(`\nAI GitHub discovery — ${date} (${env.AGS_TIMEZONE})`);
  console.log(`토큰: ${env.GITHUB_TOKEN ? `사용 (${maskToken(env.GITHUB_TOKEN)})` : '없음 — 비인증 호출 (검색 분당 10회 제한)'}`);
  console.log(`데이터 위치: ${rel(paths.data.dir)}`);

  if (process.argv.includes('--dry-run')) {
    console.log('\n실행할 검색어 (--dry-run, API 호출 안 함)');
    for (const q of buildQueries(config, date)) console.log(`  ${q.kind.padEnd(5)} limit=${String(q.limit).padEnd(4)} ${q.q}`);
    return;
  }

  const registry = await readRegistry(paths.data.registry);
  const registered = registeredRepositories(registry);
  const client = new GitHubRestClient({
    token: env.GITHUB_TOKEN,
    baseUrl: env.GITHUB_API_BASE_URL,
    apiVersion: env.GITHUB_API_VERSION,
    timeoutMs: env.GITHUB_REQUEST_TIMEOUT_MS,
    maxRetries: env.GITHUB_MAX_RETRIES,
    maxRateLimitWaitMs: env.GITHUB_MAX_RATE_LIMIT_WAIT_MS,
    onEvent: (e) => {
      if (e.type === 'retry') console.log(`  ↻ 재시도 ${e.path} (${e.reason}) ${e.waitMs / 1000}s 후`);
      if (e.type === 'rate-limit-wait') console.log(`  ⏳ rate limit — ${Math.ceil(e.waitMs / 1000)}s 대기`);
    },
  });

  console.log(`Registry 등록 저장소: ${registered.length}개\n`);
  const started = Date.now();
  const { output, stats } = await discoverRepositories({
    date,
    config,
    adapter: client,
    registered,
    onProgress: (m) => console.log(`  ${m}`),
  });

  const validator = await loadValidator(paths.schemas);
  validator.assert('repository.schema.json#/$defs/discoveryOutput', output);

  const baselineDate = selectBaselineDate(await listSnapshotDates(paths.data.snapshots), date);
  const analyzerInput = {
    date,
    current: output.repositories,
    previousSnapshot: baselineDate ? await readSnapshot(paths.data.snapshots, baselineDate) : null,
    firstSeen: firstSeenMap(registry),
  };

  const outDir = join(paths.output, 'discovery');
  const discoveryPath = join(outDir, `${date}.json`);
  const analyzerPath = join(outDir, `${date}.analyzer-input.json`);
  await writeJson(discoveryPath, output);
  await writeJson(analyzerPath, analyzerInput);

  const t = stats.tracking;
  const rl = client.rateLimit;
  console.log(`
■ 결과
  검색어 ${stats.queries}개 · 원본 결과 topic ${stats.rawResults.topic}건 / 신규 ${stats.rawResults.new}건
  정리 후 ${stats.searched}개 + 등록 저장소 추적 ${t.added.length}개 = 총 ${stats.total}개
  추적: 대상 ${t.candidates} · 조회 ${t.checked} · 추가 ${t.added.length} · 없음 ${t.missing.length} · archived ${t.archived.length}${t.skippedOverLimit ? ` · 설정 한도로 생략 ${t.skippedOverLimit}` : ''}${t.stoppedByRateLimit ? ` · API 한도로 중단 ${t.stoppedByRateLimit}` : ''}
  API 요청 ${client.requestCount}회 · ${((Date.now() - started) / 1000).toFixed(1)}s${rl.remaining !== null ? ` · 남은 한도(${rl.resource}) ${rl.remaining}/${rl.limit}` : ''}
  비교 기준 Snapshot: ${baselineDate ?? '없음 (첫 실행 — 증가량은 다음 실행부터)'}

■ 저장
  ${rel(discoveryPath)}
  ${rel(analyzerPath)}

■ 다음 단계
  npm run demo -- --input ${rel(analyzerPath)}          # 결과 보기
  npm run demo -- --input ${rel(analyzerPath)} --save   # 결과 보기 + 오늘 Snapshot/Registry 저장
`);
  if (t.missing.length) console.log(`※ 조회되지 않은 등록 저장소: ${t.missing.join(', ')}`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  if ((e as { status?: number }).status === 401) {
    console.error('  GITHUB_TOKEN 이 잘못되었거나 만료되었습니다. 셸에 export 된 GITHUB_TOKEN 이 있으면 .env 보다 우선합니다 (echo $GITHUB_TOKEN 확인).');
  }
  process.exit(1);
});
