import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitHubRestClient } from '../src/adapters/github-rest.js';
import {
  CompositeStudyStateAdapter,
  LocalStudyStateAdapter,
  PullRequestStudyStateAdapter,
  listStudySlugs,
  mergeStudyStates,
  safeStudySlug,
} from '../src/adapters/study-state.js';
import { studyStatesFromRegistry, updateRegistry, emptyRegistry, applyStudyability } from '../src/core/registry.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ags-studies-'));
  await writeFile(join(dir, 'affaan-m__ecc.md'), '# ECC\n');
  await writeFile(join(dir, 'trycua__cua.md'), '# cua\n');
  await writeFile(join(dir, '.gitkeep'), '');
  await writeFile(join(dir, 'notes.txt'), 'ignored');
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('listStudySlugs', () => {
  it('lists *.md slugs only', async () => {
    expect([...(await listStudySlugs(dir))].sort()).toEqual(['affaan-m__ecc', 'trycua__cua']);
  });
  it('returns empty set when the folder does not exist', async () => {
    expect((await listStudySlugs(join(dir, 'missing'))).size).toBe(0);
  });
});

describe('safeStudySlug', () => {
  it('returns null for ids that break the slug rule instead of throwing', () => {
    expect(safeStudySlug('a/b/c')).toBeNull();
    expect(safeStudySlug('owner/Repo Name')).toBeNull();
    expect(safeStudySlug('Owner/Repo')).toBe('owner__repo');
  });
});

describe('LocalStudyStateAdapter', () => {
  it('marks studyExists when studies/{slug}.md exists (case-insensitive)', async () => {
    const adapter = new LocalStudyStateAdapter(dir);
    const states = await adapter.getStudyStates(['affaan-m/ECC', 'TryCua/cua', 'NousResearch/hermes-agent', 'bad/id/x']);
    expect(states).toEqual({
      'affaan-m/ECC': { studyExists: true, prOpen: false },
      'TryCua/cua': { studyExists: true, prOpen: false },
      'NousResearch/hermes-agent': { studyExists: false, prOpen: false },
      'bad/id/x': { studyExists: false, prOpen: false },
    });
  });
});

type Reply = { status?: number; body?: unknown };
function fakeClient(replies: Reply[]) {
  const calls: string[] = [];
  const queue = [...replies];
  const fetchFn = (async (input: URL | string) => {
    calls.push(String(input));
    const r = queue.shift();
    if (!r) throw new Error('no more fake replies');
    return new Response(JSON.stringify(r.body ?? []), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { client: new GitHubRestClient({ fetch: fetchFn, sleep: async () => {} }), calls };
}

describe('PullRequestStudyStateAdapter', () => {
  it('rejects an invalid study repository', () => {
    const { client } = fakeClient([]);
    expect(() => new PullRequestStudyStateAdapter(client, 'not-a-repo')).toThrow(/Invalid study repository/);
  });

  it('marks prOpen when an open PR has head branch study/{slug}', async () => {
    const { client, calls } = fakeClient([
      { body: [{ head: { ref: 'study/nousresearch__hermes-agent' } }, { head: { ref: 'feature/other' } }] },
    ]);
    const adapter = new PullRequestStudyStateAdapter(client, 'sonic0506/ai-github-study-automation');
    const states = await adapter.getStudyStates(['NousResearch/hermes-agent', 'affaan-m/ECC']);
    expect(states).toEqual({
      'NousResearch/hermes-agent': { studyExists: false, prOpen: true },
      'affaan-m/ECC': { studyExists: false, prOpen: false },
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/repos/sonic0506/ai-github-study-automation/pulls');
    expect(url.searchParams.get('state')).toBe('open');
    expect(url.searchParams.get('per_page')).toBe('100');
  });

  it('paginates until a short page', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ head: { ref: `feature/${i}` } }));
    const { client, calls } = fakeClient([{ body: full }, { body: [{ head: { ref: 'study/a__b' } }] }]);
    const adapter = new PullRequestStudyStateAdapter(client, 'o/r');
    expect([...(await adapter.openStudyBranches())]).toEqual(['study/a__b']);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1]!).searchParams.get('page')).toBe('2');
  });
});

describe('mergeStudyStates / CompositeStudyStateAdapter', () => {
  it('ORs flags across sources and ignores repository case', () => {
    const merged = mergeStudyStates(
      { 'a/b': { studyExists: true, prOpen: false } },
      { 'A/B': { studyExists: false, prOpen: true }, 'c/d': { studyExists: false, prOpen: false, notStudyable: true } },
      { 'c/d': { studyExists: false, prOpen: false } },
    );
    expect(merged).toEqual({
      'a/b': { studyExists: true, prOpen: true },
      'c/d': { studyExists: false, prOpen: false, notStudyable: true },
    });
  });

  it('combines local files, open PRs and registry studyability', async () => {
    const { client } = fakeClient([{ body: [{ head: { ref: 'study/nousresearch__hermes-agent' } }] }]);
    const composite = new CompositeStudyStateAdapter([
      new LocalStudyStateAdapter(dir),
      new PullRequestStudyStateAdapter(client, 'o/r'),
    ]);
    const repos = ['affaan-m/ECC', 'NousResearch/hermes-agent', 'some/list'];
    const registry = applyStudyability(
      updateRegistry(emptyRegistry(), '2026-09-18', repos.map((repository) => ({ repository })), '2026-09-18T00:00:00Z'),
      [{ repository: 'some/list', studyability: { studyable: false, category: 'awesome-list', reason: 'link collection', checkedAt: '2026-09-18' } }],
      '2026-09-18T00:00:00Z',
    );
    const merged = mergeStudyStates(await composite.getStudyStates(repos), studyStatesFromRegistry(registry));
    expect(merged['affaan-m/ECC']).toEqual({ studyExists: true, prOpen: false });
    expect(merged['NousResearch/hermes-agent']).toEqual({ studyExists: false, prOpen: true });
    expect(merged['some/list']).toEqual({ studyExists: false, prOpen: false, notStudyable: true });
  });
});
