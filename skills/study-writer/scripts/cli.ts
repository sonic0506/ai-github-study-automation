/**
 * 사용법:
 *   node scripts/render.mjs input.json > study-draft.json
 *
 * input: { date, note, repository, candidate, templates? }
 *   - note: my-writing-style 을 거친 Research Note
 *   - templates 를 생략하면 번들된 resources/study.md, resources/study-pr.md 를 사용한다
 * output: StudyDraft { repository, branch, path, title, markdown, prBody }
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonInput, runCli, writeJsonOutput } from '../../../src/core/json-io.js';
import { renderStudyDraft, type StudyRenderInput } from './render.js';

type CliInput = Omit<StudyRenderInput, 'templates'> & { templates?: Partial<StudyRenderInput['templates']> };

runCli(async () => {
  const input = (await readJsonInput(process.argv[2])) as CliInput;
  const resources = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');
  const read = (name: string) => readFile(join(resources, name), 'utf8');

  writeJsonOutput(
    renderStudyDraft({
      ...input,
      templates: {
        study: input.templates?.study ?? (await read('study.md')),
        pr: input.templates?.pr ?? (await read('study-pr.md')),
      },
    }),
  );
});
