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
  const mk = (full_name: string, stars: number, extra: Partial<GitHubSearchItem> = {}): GitHubSearchItem => ({
    full_name, html_url: `https://github.com/${full_name}`, description: null, stargazers_count: stars,
    topics: ['llm'], created_at: '2026-09-01T00:00:00Z', pushed_at: '2026-09-10T00:00:00Z', archived: false, fork: false, ...extra,
  });

  it('interprets search qualifiers and limit', async () => {
    const adapter = new FixtureGitHubAdapter([
      mk('a/a', 50), mk('b/b', 500), mk('c/c', 900), mk('d/d', 800, { archived: true }),
      mk('e/e', 700, { created_at: '2025-01-01T00:00:00Z' }), mk('f/f', 600, { topics: ['rag'] }),
    ]);
    const res = await adapter.searchRepositories('topic:llm stars:>=100 created:>=2026-08-01 archived:false fork:false', 2);
    expect(res.map((r) => r.full_name)).toEqual(['c/c', 'b/b']);
    expect(adapter.queries).toHaveLength(1);
    await expect(adapter.searchRepositories('language:go', 1)).rejects.toThrow(/unsupported/);
  });

  it('looks up repositories case-insensitively and returns study states', async () => {
    const adapter = new FixtureGitHubAdapter([mk('Owner/Repo', 10)], { 'b/b': { studyExists: true, prOpen: false } });
    expect((await adapter.getRepository('owner/repo'))?.full_name).toBe('Owner/Repo');
    expect(await adapter.getRepository('x/y')).toBeNull();
    expect(await adapter.getStudyStates(['b/b', 'c/c'])).toEqual({
      'b/b': { studyExists: true, prOpen: false },
      'c/c': { studyExists: false, prOpen: false },
    });
  });
});
