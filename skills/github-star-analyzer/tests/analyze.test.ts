import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RepositoryObservation, Snapshot } from '../../../src/core/types.js';
import {
  analyzeStars,
  computeDelta,
  dedupeObservations,
  rankByGrowth,
  rankByTotalStars,
  selectBaselineDate,
  daysBetween,
  type AnalyzerInput,
} from '../scripts/analyze.js';

const obs = (repository: string, stars: number, description: string | null = `${repository} desc`): RepositoryObservation => ({
  repository,
  url: `https://github.com/${repository}`,
  description,
  stars,
});

const snap = (date: string, entries: [string, number][]): Snapshot => ({
  version: 1,
  date,
  repositories: entries.map(([repository, stars]) => ({ repository, stars })),
});

const fixture = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

describe('computeDelta', () => {
  it('returns null when there is no previous data', () => expect(computeDelta(10, null)).toBeNull());
  it('returns 0 for unchanged stars', () => expect(computeDelta(10, 10)).toBe(0));
  it('returns negative for star decrease', () => expect(computeDelta(8, 10)).toBe(-2));
});

describe('analyzeStars', () => {
  const base: AnalyzerInput = {
    date: '2026-09-17',
    current: [obs('a/new', 500), obs('b/zero', 1000), obs('c/down', 2000), obs('d/up', 300)],
    previousSnapshot: snap('2026-09-16', [
      ['b/zero', 1000],
      ['c/down', 2010],
      ['d/up', 100],
    ]),
    firstSeen: { 'b/zero': '2026-09-01', 'c/down': '2026-08-20', 'd/up': '2026-09-10' },
  };

  it('marks repositories without previous data as new with delta null', () => {
    const r = analyzeStars(base).repositories.find((x) => x.repository === 'a/new')!;
    expect(r).toMatchObject({ previousStars: null, delta24h: null, isNew: true, firstSeen: '2026-09-17' });
  });

  it('keeps firstSeen from the registry for known repositories', () => {
    const r = analyzeStars(base).repositories.find((x) => x.repository === 'd/up')!;
    expect(r).toMatchObject({ previousStars: 100, delta24h: 200, isNew: false, firstSeen: '2026-09-10' });
  });

  it('handles zero growth and star decrease', () => {
    const { repositories } = analyzeStars(base);
    expect(repositories.find((x) => x.repository === 'b/zero')!.delta24h).toBe(0);
    expect(repositories.find((x) => x.repository === 'c/down')!.delta24h).toBe(-10);
  });

  it('excludes zero, negative and null deltas from growth ranking', () => {
    const { growth24hTop10 } = analyzeStars(base).rankings;
    expect(growth24hTop10.map((r) => r.repository)).toEqual(['d/up']);
    expect(growth24hTop10[0]!.rank).toBe(1);
  });

  it('ranks by total stars including new repositories', () => {
    const { totalStarsTop10 } = analyzeStars(base).rankings;
    expect(totalStarsTop10.map((r) => [r.rank, r.repository])).toEqual([
      [1, 'c/down'],
      [2, 'b/zero'],
      [3, 'a/new'],
      [4, 'd/up'],
    ]);
  });

  it('lists newly discovered repositories', () => {
    expect(analyzeStars(base).rankings.newlyDiscovered.map((r) => r.repository)).toEqual(['a/new']);
  });

  it('treats every repository as new on the first run (no snapshot, empty registry)', () => {
    const out = analyzeStars({ ...base, previousSnapshot: null, firstSeen: {} });
    expect(out.repositories.every((r) => r.isNew && r.delta24h === null)).toBe(true);
    expect(out.rankings.growth24hTop10).toEqual([]);
    expect(out.rankings.newlyDiscovered).toHaveLength(4);
    expect(out.baseline).toBeNull();
  });

  it('does not mark registered repositories as new when the baseline is missing', () => {
    const out = analyzeStars({ ...base, previousSnapshot: null });
    expect(out.rankings.newlyDiscovered.map((r) => r.repository)).toEqual(['a/new']);
    expect(out.repositories.find((r) => r.repository === 'b/zero')).toMatchObject({ isNew: false, delta24h: null });
  });

  it('keeps a registered repository that re-entered the list as not new (delta null)', () => {
    const out = analyzeStars({
      ...base,
      current: [...base.current, obs('e/back', 700)],
      firstSeen: { ...base.firstSeen, 'e/back': '2026-08-01' },
    });
    expect(out.repositories.find((r) => r.repository === 'e/back')).toMatchObject({
      isNew: false, previousStars: null, delta24h: null, firstSeen: '2026-08-01',
    });
    expect(out.rankings.newlyDiscovered.map((r) => r.repository)).toEqual(['a/new']);
  });

  it('marks an unregistered repository as new even if it exists in the baseline', () => {
    const out = analyzeStars({ ...base, firstSeen: {} });
    expect(out.repositories.find((r) => r.repository === 'd/up')).toMatchObject({ isNew: true, delta24h: 200 });
  });

  it('reports a 1-day baseline for the previous day', () => {
    expect(analyzeStars(base).baseline).toEqual({ date: '2026-09-16', gapDays: 1 });
  });

  it('compares against an older snapshot when days are missing', () => {
    const out = analyzeStars({ ...base, previousSnapshot: { ...base.previousSnapshot!, date: '2026-09-13' } });
    expect(out.baseline).toEqual({ date: '2026-09-13', gapDays: 4 });
    expect(out.repositories.find((r) => r.repository === 'd/up')!.delta24h).toBe(200);
  });

  it('requires firstSeen', () => {
    expect(() => analyzeStars({ ...base, firstSeen: undefined as never })).toThrow(/firstSeen is required/);
  });

  it('returns fewer than 10 entries when there are fewer candidates', () => {
    const out = analyzeStars(base);
    expect(out.rankings.totalStarsTop10).toHaveLength(4);
  });

  it('caps rankings at topN', () => {
    const current = Array.from({ length: 15 }, (_, i) => obs(`o/r${String(i).padStart(2, '0')}`, 1000 + i * 10));
    const prev = snap('2026-09-16', current.map((c) => [c.repository, 1000]));
    const out = analyzeStars({ date: '2026-09-17', current, previousSnapshot: prev, firstSeen: {} });
    expect(out.rankings.totalStarsTop10).toHaveLength(10);
    expect(out.rankings.growth24hTop10).toHaveLength(10);
    expect(out.rankings.totalStarsTop10[0]!.repository).toBe('o/r14');
    expect(out.rankings.growth24hTop10.at(-1)!.repository).toBe('o/r05');
  });

  it('respects custom topN / growthMinDelta options', () => {
    const out = analyzeStars({ ...base, options: { topN: 2, growthMinDelta: -100 } });
    expect(out.rankings.totalStarsTop10).toHaveLength(2);
    expect(out.rankings.growth24hTop10.map((r) => r.repository)).toEqual(['d/up', 'b/zero']);
  });

  it('matches previous snapshot case-insensitively', () => {
    const out = analyzeStars({
      date: '2026-09-17',
      current: [obs('Owner/Repo', 150)],
      previousSnapshot: snap('2026-09-16', [['owner/repo', 100]]),
      firstSeen: { 'OWNER/REPO': '2026-09-01' },
    });
    expect(out.repositories[0]).toMatchObject({ delta24h: 50, isNew: false });
  });

  it('builds today snapshot sorted by repository', () => {
    const out = analyzeStars(base);
    expect(out.snapshot).toEqual(
      snap('2026-09-17', [
        ['a/new', 500],
        ['b/zero', 1000],
        ['c/down', 2000],
        ['d/up', 300],
      ]),
    );
  });

  it('is deterministic regardless of input order', () => {
    const a = analyzeStars(base);
    const b = analyzeStars({ ...base, current: [...base.current].reverse() });
    expect(b).toEqual(a);
  });

  it('breaks ties by repository name', () => {
    const out = analyzeStars({ date: '2026-09-17', current: [obs('z/z', 100), obs('a/a', 100)], previousSnapshot: null, firstSeen: {} });
    expect(out.rankings.totalStarsTop10.map((r) => r.repository)).toEqual(['a/a', 'z/z']);
  });

  it('rejects invalid input', () => {
    expect(() => analyzeStars({ ...base, date: '2026/09/17' })).toThrow(/Invalid date/);
    expect(() => analyzeStars({ ...base, current: [obs('bad', 1)] })).toThrow(/Invalid repository/);
    expect(() => analyzeStars({ ...base, current: [obs('a/b', -1)] })).toThrow(/Invalid stars/);
    expect(() => analyzeStars({ ...base, current: [obs('a/b', 1.5)] })).toThrow(/Invalid stars/);
    expect(() => analyzeStars({ ...base, previousSnapshot: snap('2026-09-17', []) })).toThrow(/must be before/);
  });

  it('matches the fixture expectation', () => {
    const input = fixture('input.json') as AnalyzerInput;
    const expected = fixture('expected-summary.json');
    const out = analyzeStars(input);
    expect({
      totalStarsTop10: out.rankings.totalStarsTop10.map((r) => r.repository),
      growth24hTop10: out.rankings.growth24hTop10.map((r) => [r.repository, r.delta24h]),
      newlyDiscovered: out.rankings.newlyDiscovered.map((r) => r.repository),
    }).toEqual(expected);
  });
});

describe('dedupeObservations', () => {
  it('keeps one entry per repository (case-insensitive) with the highest stars', () => {
    const out = dedupeObservations([obs('a/x', 10), obs('A/X', 30, null), obs('a/x', 20)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ repository: 'A/X', stars: 30, description: 'a/x desc' });
  });

  it('keeps the first occurrence on equal stars', () => {
    const out = dedupeObservations([obs('a/x', 10, 'first'), obs('a/x', 10, 'second')]);
    expect(out[0]!.description).toBe('first');
  });

  it('flows through analyzeStars without duplicate ranking entries', () => {
    const out = analyzeStars({
      date: '2026-09-17',
      current: [obs('a/x', 10), obs('a/x', 12)],
      previousSnapshot: snap('2026-09-16', [['a/x', 5]]),
      firstSeen: {},
    });
    expect(out.repositories).toHaveLength(1);
    expect(out.rankings.growth24hTop10).toHaveLength(1);
    expect(out.rankings.growth24hTop10[0]!.delta24h).toBe(7);
  });
});

describe('baseline helpers', () => {
  it('daysBetween counts calendar days across months', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-09-10', '2026-09-17')).toBe(7);
  });

  it('selectBaselineDate picks the latest date before today', () => {
    const dates = ['2026-09-10', '2026-09-17', '2026-09-14', 'junk', '2026-09-18'];
    expect(selectBaselineDate(dates, '2026-09-17')).toBe('2026-09-14');
    expect(selectBaselineDate(dates, '2026-09-17', 2)).toBeNull();
    expect(selectBaselineDate([], '2026-09-17')).toBeNull();
    expect(selectBaselineDate(['2026-09-17'], '2026-09-17')).toBeNull();
  });
});

describe('ranking helpers', () => {
  it('handle empty input', () => {
    expect(rankByTotalStars([], 10)).toEqual([]);
    expect(rankByGrowth([], 10, 1)).toEqual([]);
  });
});
