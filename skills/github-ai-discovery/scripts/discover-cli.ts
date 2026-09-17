/**
 * 사용법 (Skill 런타임):
 *   GITHUB_TOKEN=... node scripts/discover.mjs input.json > discovery.json
 *
 * input: { date, registered?: string[], config?: DiscoveryConfig(YAML 문자열/객체), dryRun?: boolean }
 *   - config 생략 시 resources/discovery.yml
 *   - dryRun=true 이면 API 를 호출하지 않고 실행할 검색어 목록만 출력
 * output: DiscoveryOutput { date, repositories }   (진행 상황·통계는 stderr)
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubRestClient } from '../../../src/adapters/github-rest.js';
import { parseDiscoveryConfig } from '../../../src/core/config.js';
import { parseEnv } from '../../../src/core/env.js';
import { readJsonInput, runCli, writeJsonOutput } from '../../../src/core/json-io.js';
import { buildQueries, discoverRepositories } from './discover.js';

interface CliInput {
  date: string;
  registered?: string[];
  config?: unknown;
  dryRun?: boolean;
}

runCli(async () => {
  const input = (await readJsonInput(process.argv[2])) as CliInput;
  const here = dirname(fileURLToPath(import.meta.url));
  const config = parseDiscoveryConfig(
    input.config ?? (await readFile(join(here, '..', 'resources', 'discovery.yml'), 'utf8')),
  );
  if (input.dryRun) {
    writeJsonOutput({ date: input.date, queries: buildQueries(config, input.date) });
    return;
  }
  const env = parseEnv(process.env);
  const client = new GitHubRestClient({
    token: env.GITHUB_TOKEN,
    baseUrl: env.GITHUB_API_BASE_URL,
    apiVersion: env.GITHUB_API_VERSION,
    timeoutMs: env.GITHUB_REQUEST_TIMEOUT_MS,
    maxRetries: env.GITHUB_MAX_RETRIES,
    maxRateLimitWaitMs: env.GITHUB_MAX_RATE_LIMIT_WAIT_MS,
    onEvent: (e) => {
      if (e.type !== 'request') process.stderr.write(`${e.type} ${e.path} wait=${e.waitMs}ms\n`);
    },
  });
  const { output, stats } = await discoverRepositories({
    date: input.date,
    config,
    adapter: client,
    registered: input.registered ?? [],
    onProgress: (m) => process.stderr.write(`${m}\n`),
  });
  process.stderr.write(`${JSON.stringify({ stats, requests: client.requestCount, rateLimit: client.rateLimit })}\n`);
  writeJsonOutput(output);
});
