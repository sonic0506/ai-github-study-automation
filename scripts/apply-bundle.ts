/**
 * npm run apply-bundle -- --file <bundle.json> [--checksum <sha256>] [--draft <index>]
 *
 * GitHub Actions 에서 DailyBundle 을 저장소 파일로 반영한다.
 *   기본: Snapshot / Registry / Study Queue / Daily Report 기록
 *   --draft N: N번째 Study 초안만 파일로 기록 (branch 를 만든 뒤 호출)
 */
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { applyBundle, writeStudyDraft } from '../src/core/apply-bundle.js';
import { bundleChecksum, validateBundle } from '../src/core/bundle.js';
import { getProjectPaths } from '../src/core/paths.js';
import { loadValidator } from '../src/core/schema.js';
import type { DailyBundle } from '../src/core/types.js';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const paths = getProjectPaths();
  const file = arg('--file');
  if (!file) throw new Error('usage: npm run apply-bundle -- --file <bundle.json>');

  const bundle = JSON.parse(await readFile(file, 'utf8')) as DailyBundle;
  const expected = arg('--checksum');
  if (expected) {
    const actual = bundleChecksum(bundle);
    if (actual !== expected) throw new Error(`checksum mismatch: expected ${expected}, got ${actual}`);
    console.log(`checksum ok (${actual.slice(0, 16)}…)`);
  }
  const check = validateBundle(bundle, await loadValidator(paths.schemas));
  if (!check.ok) throw new Error(`Invalid bundle:\n  ${check.errors.join('\n  ')}`);

  const draftIndex = arg('--draft');
  if (draftIndex !== undefined) {
    const draft = bundle.studyDrafts[Number(draftIndex)];
    if (!draft) throw new Error(`no study draft at index ${draftIndex}`);
    const written = await writeStudyDraft(draft, paths.root);
    console.log(`study draft: ${written} (${draft.repository})`);
    return;
  }

  const dataDir = relative(paths.root, paths.data.dir) || 'data';
  const result = await applyBundle(bundle, { root: paths.root, dataDir });
  console.log(`applied ${bundle.date}: ${result.written.join(', ')}`);
  console.log(`registry ${result.registrySize} repositories · studyability updates ${result.studyabilityUpdates}`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
