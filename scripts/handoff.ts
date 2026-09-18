/**
 * npm run handoff -- --bundle <file> --repo <owner/name> [--event ai-github-study-daily] [--dry-run]
 *
 * DailyBundle 을 비공개 Gist 에 올리고 repository_dispatch 로 주소를 전달한다.
 * 필요한 토큰 권한: Gists read & write + 대상 저장소 Contents read & write
 */
import { readFile } from 'node:fs/promises';
import { GitHubRestClient } from '../src/adapters/github-rest.js';
import { GistHandoff, handoffBundle } from '../src/adapters/gist.js';
import { bundleChecksum, serializeBundle, validateBundle } from '../src/core/bundle.js';
import { loadEnv, maskToken } from '../src/core/env.js';
import { getProjectPaths } from '../src/core/paths.js';
import { loadValidator } from '../src/core/schema.js';
import type { DailyBundle } from '../src/core/types.js';

const DEFAULT_EVENT = 'ai-github-study-daily';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const env = loadEnv();
  const paths = getProjectPaths();
  const bundlePath = arg('--bundle');
  const repository = arg('--repo');
  if (!bundlePath || !repository) throw new Error('usage: npm run handoff -- --bundle <file> --repo <owner/name>');

  const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as DailyBundle;
  const check = validateBundle(bundle, await loadValidator(paths.schemas));
  if (!check.ok) throw new Error(`Invalid bundle:\n  ${check.errors.join('\n  ')}`);

  const content = serializeBundle(bundle);
  const checksum = bundleChecksum(bundle);
  const eventType = arg('--event') ?? DEFAULT_EVENT;
  const bytes = Buffer.byteLength(content);

  console.log(`\nHandoff ${bundle.date} → ${repository}`);
  console.log(`  번들 ${(bytes / 1024).toFixed(1)} KB · sha256 ${checksum.slice(0, 16)}…`);
  console.log(`  토큰: ${env.GITHUB_TOKEN ? maskToken(env.GITHUB_TOKEN) : '없음'} · event_type: ${eventType}`);

  if (process.argv.includes('--dry-run')) {
    console.log('\n--dry-run: Gist 업로드와 dispatch 를 실행하지 않았다.\n');
    return;
  }
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN 이 필요하다 (Gists read & write + Contents read & write)');

  const client = new GitHubRestClient({
    token: env.GITHUB_TOKEN,
    baseUrl: env.GITHUB_API_BASE_URL,
    apiVersion: env.GITHUB_API_VERSION,
    timeoutMs: env.GITHUB_REQUEST_TIMEOUT_MS,
    maxRetries: env.GITHUB_MAX_RETRIES,
  });
  const result = await handoffBundle(new GistHandoff(client), {
    repository,
    eventType,
    date: bundle.date,
    runId: bundle.runId,
    checksum,
    content,
  });

  console.log(`\n■ 전달 완료
  Gist: ${result.gist.html_url}
  dispatch: ${eventType} → ${repository}
  Actions 가 번들을 내려받아 처리한 뒤 Gist 를 삭제한다.\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
