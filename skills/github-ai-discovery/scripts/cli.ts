/**
 * 사용법:
 *   node scripts/normalize.mjs raw.json > discovery.json
 *
 * input: { date, resultsByTopic: { [topic]: GitHubSearchItem[] }, config?: DiscoveryConfig(YAML 문자열 또는 객체) }
 *   - config 를 생략하면 번들된 resources/discovery.yml 을 사용한다.
 * output: DiscoveryOutput { date, repositories: RepositoryObservation[] }
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiscoveryConfig } from '../../../src/core/config.js';
import { readJsonInput, runCli, writeJsonOutput } from '../../../src/core/json-io.js';
import { normalizeSearchResults, type GitHubSearchItem } from './normalize.js';

interface CliInput {
  date: string;
  resultsByTopic: Record<string, GitHubSearchItem[]>;
  config?: unknown;
}

runCli(async () => {
  const input = (await readJsonInput(process.argv[2])) as CliInput;
  const here = dirname(fileURLToPath(import.meta.url));
  const cfg = parseDiscoveryConfig(
    input.config ?? (await readFile(join(here, '..', 'resources', 'discovery.yml'), 'utf8')),
  );
  writeJsonOutput(
    normalizeSearchResults(input.date, input.resultsByTopic, {
      minimumStars: cfg.minimum_stars,
      excludeArchived: cfg.search.exclude_archived,
      excludeForks: cfg.search.exclude_forks,
    }),
  );
});
