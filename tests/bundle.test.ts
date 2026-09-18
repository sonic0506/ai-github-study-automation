import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitHubRestClient } from '../src/adapters/github-rest.js';
import { GistHandoff, handoffBundle } from '../src/adapters/gist.js';
import { applyBundle, resolveInside, snapshotFromBundle, writeStudyDraft } from '../src/core/apply-bundle.js';
import { buildDailyBundle, bundleChecksum, checkBundleConsistency, serializeBundle, validateBundle } from '../src/core/bundle.js';
import { getProjectPaths } from '../src/core/paths.js';
import { loadValidator, type SchemaValidator } from '../src/core/schema.js';
import type { DailyBundle } from '../src/core/types.js';

const paths = getProjectPaths(undefined, 'data');
const readJson = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
let v: SchemaValidator;
let fixture: DailyBundle;

beforeAll(async () => {
  v = await loadValidator(paths.schemas);
  fixture = (await readJson(new URL('./fixtures/daily-bundle.valid.json', import.meta.url).pathname)) as DailyBundle;
});

const parts = () => ({
  date: fixture.date,
  runId: fixture.runId,
  generatedAt: fixture.generatedAt,
  baseline: fixture.baseline,
  repositories: fixture.repositories,
  rankings: fixture.rankings,
  studyQueue: fixture.studyQueue,
  dailyReport: fixture.dailyReport,
  studyDrafts: fixture.studyDrafts,
  studyabilityUpdates: fixture.studyabilityUpdates,
});

describe('buildDailyBundle', () => {
  it('assembles a bundle that passes the schema', () => {
    const bundle = buildDailyBundle(parts());
    expect(bundle.version).toBe(1);
    expect(validateBundle(bundle, v)).toEqual({ ok: true, errors: [] });
  });

  it('defaults drafts and studyability updates to empty arrays', () => {
    const { studyDrafts: _d, studyabilityUpdates: _s, ...rest } = parts();
    const bundle = buildDailyBundle(rest);
    expect(bundle.studyDrafts).toEqual([]);
    expect(bundle.studyabilityUpdates).toEqual([]);
  });

  it('rejects a queue for another date and a report path without the date', () => {
    expect(() => buildDailyBundle({ ...parts(), studyQueue: { ...fixture.studyQueue, date: '2026-01-01' } })).toThrow(/studyQueue.date/);
    expect(() =>
      buildDailyBundle({ ...parts(), dailyReport: { ...fixture.dailyReport, path: 'reports/daily/other.md' } }),
    ).toThrow(/must contain the date/);
  });
});

describe('checkBundleConsistency', () => {
  it('flags drafts that are not selected, duplicated or over the daily limit', () => {
    const draft = fixture.studyDrafts[0]!;
    const notSelected = { ...fixture, studyDrafts: [{ ...draft, repository: 'zen/new-agent' }] };
    expect(checkBundleConsistency(notSelected)).toContain('studyDrafts: zen/new-agent is not selected in the study queue');

    const duplicated = { ...fixture, studyDrafts: [draft, draft] };
    expect(checkBundleConsistency(duplicated)).toEqual(
      expect.arrayContaining([`studyDrafts: duplicate path ${draft.path}`, `studyDrafts: duplicate branch ${draft.branch}`]),
    );

    const tooMany = {
      ...fixture,
      studyQueue: { ...fixture.studyQueue, maxDailyDrafts: 0 },
      studyDrafts: [draft],
    };
    expect(checkBundleConsistency(tooMany).some((p) => p.includes('exceed maxDailyDrafts'))).toBe(true);
  });

  it('flags a baseline that is not before the date and unknown studyability targets', () => {
    expect(checkBundleConsistency({ ...fixture, baseline: { date: fixture.date, gapDays: 1 } })).toEqual(
      expect.arrayContaining([expect.stringContaining('must be before date')]),
    );
    const unknown = { ...fixture, studyabilityUpdates: [{ repository: 'no/such', studyability: fixture.studyabilityUpdates[0]!.studyability }] };
    expect(checkBundleConsistency(unknown)).toContain('studyabilityUpdates: no/such is not in repositories');
  });

  it('accepts a case-different repository in drafts and updates', () => {
    const draft = fixture.studyDrafts[0]!;
    const upper = { ...fixture, studyDrafts: [{ ...draft, repository: draft.repository.toUpperCase() }] };
    expect(checkBundleConsistency(upper)).toEqual([]);
  });
});

describe('checksum', () => {
  it('is stable for the same bundle and changes with content', () => {
    const a = bundleChecksum(fixture);
    expect(a).toEqual(bundleChecksum(structuredClone(fixture)));
    expect(a).not.toEqual(bundleChecksum({ ...fixture, runId: 'other' }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(serializeBundle(fixture).endsWith('\n')).toBe(true);
  });
});

describe('validateBundle', () => {
  it('reports schema errors before consistency errors', () => {
    const broken = { ...fixture, version: 2 } as unknown;
    const r = validateBundle(broken, v);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/^schema:/);
  });
});

describe('applyBundle', () => {
  const dirs: string[] = [];
  afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
  const tempRoot = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ags-apply-'));
    dirs.push(dir);
    return dir;
  };

  it('writes snapshot, registry, queue and report', async () => {
    const root = await tempRoot();
    const result = await applyBundle(fixture, { root, dataDir: 'data' });
    expect(result.written).toEqual([
      `data/snapshots/${fixture.date}.json`,
      'data/registry.json',
      'data/study-queue.json',
      fixture.dailyReport.path,
    ]);

    const snapshot = await readJson(join(root, 'data', 'snapshots', `${fixture.date}.json`));
    expect(snapshot.repositories).toHaveLength(fixture.repositories.length);
    expect(snapshot.repositories[0]!.repository.toLowerCase() < snapshot.repositories[1]!.repository.toLowerCase()).toBe(true);

    const registry = await readJson(join(root, 'data', 'registry.json'));
    expect(Object.keys(registry.repositories)).toHaveLength(result.registrySize);
    const judged = fixture.studyabilityUpdates[0]!;
    expect(registry.repositories[judged.repository].studyability).toEqual(judged.studyability);

    const report = await readFile(join(root, fixture.dailyReport.path), 'utf8');
    expect(report).toBe(fixture.dailyReport.markdown);
  });

  it('keeps firstSeen when applied twice for a later date', async () => {
    const root = await tempRoot();
    await applyBundle(fixture, { root, dataDir: 'data' });
    const next: DailyBundle = {
      ...fixture,
      date: '2026-09-18',
      studyQueue: { ...fixture.studyQueue, date: '2026-09-18' },
      dailyReport: { ...fixture.dailyReport, path: 'reports/daily/2026-09-18.md' },
    };
    await applyBundle(next, { root, dataDir: 'data' });
    const registry = await readJson(join(root, 'data', 'registry.json'));
    const entry = registry.repositories[fixture.repositories[0]!.repository];
    expect(entry).toMatchObject({ firstSeen: fixture.date, lastSeen: '2026-09-18' });
  });

  it('honours a custom data directory', async () => {
    const root = await tempRoot();
    const result = await applyBundle(fixture, { root, dataDir: 'output/local-data' });
    expect(result.written[0]).toBe(`output/local-data/snapshots/${fixture.date}.json`);
  });

  it('writes a study draft and refuses paths outside the root', async () => {
    const root = await tempRoot();
    const draft = fixture.studyDrafts[0]!;
    expect(await writeStudyDraft(draft, root)).toBe(draft.path);
    expect(await readFile(join(root, draft.path), 'utf8')).toBe(draft.markdown);
    await expect(writeStudyDraft({ ...draft, path: '../escape.md' }, root)).rejects.toThrow(/escapes the repository root/);
    expect(() => resolveInside(root, '/etc/passwd')).toThrow(/escapes/);
  });

  it('builds the snapshot from bundle repositories', () => {
    const snapshot = snapshotFromBundle(fixture);
    expect(snapshot).toMatchObject({ version: 1, date: fixture.date });
    expect(snapshot.repositories.every((r) => typeof r.stars === 'number')).toBe(true);
  });
});

describe('GistHandoff', () => {
  const gistResponse = (id = 'abc123') => ({
    id,
    html_url: `https://gist.github.com/${id}`,
    files: { 'daily-bundle-2026-09-17.json': { filename: 'daily-bundle-2026-09-17.json', raw_url: `https://gist.githubusercontent.com/raw/${id}`, size: 10 } },
  });

  function setup(replies: { status?: number; body?: unknown }[]) {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const queue = [...replies];
    const fetchFn = (async (input: URL | string, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = queue.shift() ?? { status: 500 };
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
    }) as typeof fetch;
    return { handoff: new GistHandoff(new GitHubRestClient({ fetch: fetchFn, token: 't', sleep: async () => {} })), calls };
  }

  it('creates a secret gist and dispatches its address', async () => {
    const { handoff, calls } = setup([{ status: 201, body: gistResponse() }, { status: 204 }]);
    const result = await handoffBundle(handoff, {
      repository: 'sonic0506/ai-github-study-automation',
      eventType: 'ai-github-study-daily',
      date: '2026-09-17',
      runId: 'run-1',
      checksum: 'a'.repeat(64),
      content: '{"hello":1}\n',
    });

    expect(calls[0]).toMatchObject({ url: 'https://api.github.com/gists', method: 'POST' });
    expect(calls[0]!.body).toMatchObject({ public: false });
    expect(calls[1]).toMatchObject({ url: 'https://api.github.com/repos/sonic0506/ai-github-study-automation/dispatches', method: 'POST' });
    const payload = (calls[1]!.body as { client_payload: Record<string, unknown> }).client_payload;
    expect(payload).toEqual(result.payload);
    expect(Object.keys(payload)).toHaveLength(7);
    expect(payload.gist_id).toBe('abc123');
    expect(payload.bytes).toBe(12);
  });

  it('deletes the gist when the dispatch fails', async () => {
    const { handoff, calls } = setup([{ status: 201, body: gistResponse() }, { status: 404, body: { message: 'Not Found' } }, { status: 204 }]);
    await expect(
      handoffBundle(handoff, { repository: 'o/r', eventType: 'e', date: '2026-09-17', runId: 'r', checksum: 'c', content: '{}' }),
    ).rejects.toThrow(/404/);
    expect(calls.at(-1)).toMatchObject({ url: 'https://api.github.com/gists/abc123', method: 'DELETE' });
  });

  it('rejects an invalid repository and oversized payloads', async () => {
    const { handoff } = setup([]);
    await expect(handoff.dispatch('bad', 'e', {} as never)).rejects.toThrow(/Invalid repository id/);
    const big = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i]));
    await expect(handoff.dispatch('o/r', 'e', big as never)).rejects.toThrow(/at most 10 top-level properties/);
  });

  it('returns null for a missing gist and tolerates deleting one', async () => {
    const { handoff } = setup([{ status: 404, body: { message: 'Not Found' } }, { status: 404, body: { message: 'Not Found' } }]);
    expect(await handoff.getGist('nope')).toBeNull();
    await expect(handoff.deleteGist('nope')).resolves.toBeUndefined();
  });
});
