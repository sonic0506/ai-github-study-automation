/**
 * 사용법:
 *   node scripts/render.mjs input.json > report.json
 *
 * input: { date, baseline, rankings, studyQueue, repositoryCount?, config?, templates? }
 *   - config / templates 를 생략하면 번들된 resources/ 의 파일을 사용한다.
 * output: { dailyReport: { path, markdown }, telegram: { markdown } }
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReportConfig } from '../../../src/core/config.js';
import { readJsonInput, runCli, writeJsonOutput } from '../../../src/core/json-io.js';
import { renderDailyReport, type RenderInput } from './render.js';

type CliInput = Omit<RenderInput, 'config' | 'templates'> & {
  config?: unknown;
  templates?: Partial<RenderInput['templates']>;
};

runCli(async () => {
  const input = (await readJsonInput(process.argv[2])) as CliInput;
  const resources = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');
  const read = (name: string) => readFile(join(resources, name), 'utf8');

  writeJsonOutput(
    renderDailyReport({
      ...input,
      config: parseReportConfig(input.config ?? (await read('report.yml'))),
      templates: {
        report: input.templates?.report ?? (await read('daily-report.md')),
        telegram: input.templates?.telegram ?? (await read('telegram-daily.md')),
      },
    }),
  );
});
