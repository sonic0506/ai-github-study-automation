/**
 * 사용법:
 *   node scripts/select.mjs input.json > study-queue.json
 *
 * input: { date, rankings, policy?, history?, studyStates? }
 *   - policy 를 생략하면 번들된 resources/study-policy.yml 을 사용한다.
 *   - policy 는 YAML 문자열 또는 객체 모두 허용한다.
 * output: StudyQueue
 *
 * 조사 단계에서 Study 대상이 아니라고 판정된 경우:
 *   input: { queue: StudyQueue, markNotStudyable: "owner/name" }
 *   output: { queue: StudyQueue, promoted: "owner/name" | null }
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStudyPolicy } from '../../../src/core/config.js';
import { readJsonInput, runCli, writeJsonOutput } from '../../../src/core/json-io.js';
import type { StudyQueue } from '../../../src/core/types.js';
import { markNotStudyable, selectStudyCandidates, type SelectorInput } from './select.js';

type CliInput = Omit<SelectorInput, 'policy'> & { policy?: unknown; queue?: StudyQueue; markNotStudyable?: string };

async function defaultPolicy(): Promise<string> {
  // 번들 위치: <skill>/scripts/select.mjs → <skill>/resources/study-policy.yml
  const here = dirname(fileURLToPath(import.meta.url));
  return readFile(join(here, '..', 'resources', 'study-policy.yml'), 'utf8');
}

runCli(async () => {
  const input = (await readJsonInput(process.argv[2])) as CliInput;
  if (input.markNotStudyable) {
    if (!input.queue) throw new Error('markNotStudyable requires "queue"');
    writeJsonOutput(markNotStudyable(input.queue, input.markNotStudyable));
    return;
  }
  const policy = parseStudyPolicy(input.policy ?? (await defaultPolicy()));
  writeJsonOutput(selectStudyCandidates({ ...input, policy }));
});
