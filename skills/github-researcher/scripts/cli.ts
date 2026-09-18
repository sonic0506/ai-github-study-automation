/**
 * 사용법:
 *   node scripts/validate.mjs research-note.json
 *
 * Research Note 를 스키마와 출처 참조 규칙으로 검사한다.
 * output: { ok, errors, warnings, stats }  (errors 가 있으면 종료 코드 1)
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, runCli, writeJsonOutput } from '../../../src/core/json-io.js';
import { createValidator } from '../../../src/core/schema.js';
import type { ResearchNote } from '../../../src/core/types.js';
import { checkResearchNote } from './validate.js';

const SCHEMA_FILES = [
  'repository.schema.json',
  'registry.schema.json',
  'research-note.schema.json',
];

runCli(async () => {
  const note = (await readJsonInput(process.argv[2])) as ResearchNote;
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'schemas');
  const schemas = await Promise.all(SCHEMA_FILES.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8')) as object));
  const result = checkResearchNote(note, createValidator(schemas));
  writeJsonOutput(result);
  if (!result.ok) process.exitCode = 1;
});
