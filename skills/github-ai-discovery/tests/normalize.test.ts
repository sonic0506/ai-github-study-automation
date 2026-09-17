import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeSearchResults, type GitHubSearchItem } from '../scripts/normalize.js';
import { FixtureGitHubAdapter } from '../../../src/adapters/github.js';

const load = (n: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), 'utf8'));
const opts = { minimumStars: 100, excludeArchived: true, excludeForks: true };

describe('normalizeSearchResults', () => {
  it('filters, dedupes and merges topics (fixture)', () => {
    const raw = load('raw-search.json');
    expect(normalizeSearchResults(raw.date, raw.resultsByTopic, opts)).toEqual(load('expected-output.json'));
  });

  it('keeps archived and forks when the config allows it', () => {
    const raw = load('raw-search.json');
    const out = normalizeSearchResults(raw.date, raw.resultsByTopic, { ...opts, excludeArchived: false, excludeForks: false });
    expect(out.repositories.map((r) => r.repository)).toEqual([
      'Acme-AI/Agent-Kit', 'nova-labs/mcp-server-hub', 'old/archived-llm', 'someone/agent-kit-fork',
    ]);
  });

  it('is independent of topic key order', () => {
    const raw = load('raw-search.json');
    const reversed: Record<string, GitHubSearchItem[]> = Object.fromEntries(Object.entries(raw.resultsByTopic as Record<string, GitHubSearchItem[]>).reverse());
    expect(normalizeSearchResults(raw.date, reversed, opts)).toEqual(normalizeSearchResults(raw.date, raw.resultsByTopic, opts));
  });

  it('returns empty output for no results', () => {
    expect(normalizeSearchResults('2026-09-17', {}, opts)).toEqual({ date: '2026-09-17', repositories: [] });
  });
});

describe('FixtureGitHubAdapter', () => {
  it('applies minimum stars and limit', async () => {
    const mk = (repository: string, stars: number) => ({ repository, url: `https://github.com/${repository}`, description: null, stars });
    const adapter = new FixtureGitHubAdapter({ llm: [mk('a/a', 50), mk('b/b', 500), mk('c/c', 900)] }, { 'b/b': { studyExists: true, prOpen: false } });
    const res = await adapter.searchByTopic({ topic: 'llm', minimumStars: 100, limit: 1 });
    expect(res.map((r) => r.repository)).toEqual(['c/c']);
    expect(await adapter.getStudyStates(['b/b', 'c/c'])).toEqual({
      'b/b': { studyExists: true, prOpen: false },
      'c/c': { studyExists: false, prOpen: false },
    });
  });
});
