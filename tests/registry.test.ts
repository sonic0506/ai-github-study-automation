import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates.js';
import { listSnapshotDates, readRegistry, readSnapshot, writeJson, writeSnapshot } from '../src/core/local-store.js';
import { emptyRegistry, firstSeenMap, registeredRepositories, updateRegistry } from '../src/core/registry.js';
import { loadValidator } from '../src/core/schema.js';
import { getProjectPaths } from '../src/core/paths.js';

describe('registry', () => {
  const reg = updateRegistry(emptyRegistry(), '2026-09-16', [{ repository: 'B/Repo' }, { repository: 'a/repo' }], '2026-09-16T00:00:00Z');

  it('registers new repositories sorted case-insensitively', () => {
    expect(reg).toEqual({
      version: 1,
      updatedAt: '2026-09-16T00:00:00Z',
      repositories: {
        'a/repo': { firstSeen: '2026-09-16', lastSeen: '2026-09-16' },
        'B/Repo': { firstSeen: '2026-09-16', lastSeen: '2026-09-16' },
      },
    });
    expect(registeredRepositories(reg)).toEqual(['a/repo', 'B/Repo']);
    expect(firstSeenMap(reg)).toEqual({ 'a/repo': '2026-09-16', 'B/Repo': '2026-09-16' });
  });

  it('keeps firstSeen and original casing, updates lastSeen, does not mutate input', () => {
    const next = updateRegistry(reg, '2026-09-17', [{ repository: 'b/repo' }, { repository: 'c/new' }], '2026-09-17T00:00:00Z');
    expect(next.repositories).toEqual({
      'a/repo': { firstSeen: '2026-09-16', lastSeen: '2026-09-16' },
      'B/Repo': { firstSeen: '2026-09-16', lastSeen: '2026-09-17' },
      'c/new': { firstSeen: '2026-09-17', lastSeen: '2026-09-17' },
    });
    expect(reg.repositories['B/Repo']!.lastSeen).toBe('2026-09-16');
  });

  it('handles re-running an older date without moving lastSeen back', () => {
    const next = updateRegistry(reg, '2026-09-10', [{ repository: 'a/repo' }], '2026-09-17T00:00:00Z');
    expect(next.repositories['a/repo']).toEqual({ firstSeen: '2026-09-10', lastSeen: '2026-09-16' });
  });

  it('matches registry.schema.json (including the seeded data file)', async () => {
    const v = await loadValidator(getProjectPaths(undefined, 'data').schemas);
    v.assert('registry', reg);
    v.assert('registry', await readRegistry(getProjectPaths(undefined, 'data').data.registry));
    expect(v.validate('registry', { ...reg, repositories: { 'bad id': { firstSeen: '2026-09-16', lastSeen: '2026-09-16' } } }).valid).toBe(false);
  });
});

describe('dates', () => {
  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-09-17', -30)).toBe('2026-08-18');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => addDays('2026-13-01', 1)).toThrow(/Invalid date/);
  });
});

describe('local-store', () => {
  const dirs: string[] = [];
  afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

  it('reads/writes snapshots and registry, tolerating missing files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ags-store-'));
    dirs.push(dir);
    const snaps = join(dir, 'snapshots');
    expect(await listSnapshotDates(snaps)).toEqual([]);
    expect(await readSnapshot(snaps, '2026-09-16')).toBeNull();
    expect(await readRegistry(join(dir, 'registry.json'))).toEqual(emptyRegistry());

    await writeSnapshot(snaps, { version: 1, date: '2026-09-16', repositories: [{ repository: 'a/b', stars: 1 }] });
    await writeSnapshot(snaps, { version: 1, date: '2026-09-14', repositories: [] });
    await writeJson(join(snaps, 'notes.json'), {});
    expect(await listSnapshotDates(snaps)).toEqual(['2026-09-14', '2026-09-16']);
    expect((await readSnapshot(snaps, '2026-09-16'))?.repositories).toHaveLength(1);
  });
});
