import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadDiscoveryConfig, loadStudyPolicy } from '../src/core/config.js';
import { getProjectPaths } from '../src/core/paths.js';
import { loadValidator, type SchemaValidator } from '../src/core/schema.js';
import { analyzeStars } from '../skills/github-star-analyzer/scripts/analyze.js';
import { selectStudyCandidates } from '../skills/study-candidate-selector/scripts/select.js';
import type { DailyBundle } from '../src/core/types.js';

const paths = getProjectPaths();
const readJson = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
let v: SchemaValidator;

beforeAll(async () => {
  v = await loadValidator(paths.schemas);
});

describe('schemas', () => {
  it('accept analyzer and selector outputs (pipeline contract)', async () => {
    const input = await readJson(new URL('../skills/github-star-analyzer/tests/fixtures/input.json', import.meta.url).pathname);
    const out = analyzeStars(input);
    for (const r of out.repositories) v.assert('repository', r);
    v.assert('ranking', out.rankings);
    v.assert('snapshot', out.snapshot);

    const policy = await loadStudyPolicy(paths.config.studyPolicy);
    const queue = selectStudyCandidates({ date: out.date, rankings: out.rankings, policy });
    v.assert('study-queue', queue);
  });

  it('accept the daily bundle fixture', async () => {
    v.assert('daily-bundle', await readJson(new URL('./fixtures/daily-bundle.valid.json', import.meta.url).pathname));
  });

  it('accept seeded data files', async () => {
    v.assert('study-queue', await readJson(paths.data.studyQueue));
  });

  it('reject malformed repository data', () => {
    const base = {
      repository: 'a/b', url: 'https://github.com/a/b', description: null, stars: 1,
      previousStars: null, delta24h: null, firstSeen: '2026-09-17', isNew: true,
    };
    expect(v.validate('repository', base).valid).toBe(true);
    expect(v.validate('repository', { ...base, stars: -1 }).valid).toBe(false);
    expect(v.validate('repository', { ...base, repository: 'no-slash' }).valid).toBe(false);
    expect(v.validate('repository', { ...base, extra: 1 }).valid).toBe(false);
    expect(v.validate('repository', { ...base, firstSeen: '17-09-2026' }).valid).toBe(false);
    const { isNew: _omit, ...missing } = base;
    expect(v.validate('repository', missing).valid).toBe(false);
  });

  it('reject ranking entries without rank or with null growth delta', () => {
    const e = {
      repository: 'a/b', url: 'https://github.com/a/b', description: null, stars: 1,
      previousStars: null, delta24h: null, firstSeen: '2026-09-17', isNew: true,
    };
    expect(v.validate('ranking', { totalStarsTop10: [e], growth24hTop10: [], newlyDiscovered: [] }).valid).toBe(false);
    expect(
      v.validate('ranking', { totalStarsTop10: [], growth24hTop10: [{ ...e, rank: 1 }], newlyDiscovered: [] }).valid,
    ).toBe(false);
  });

  it('reject unsafe paths and bad status in the daily bundle', async () => {
    const bundle = (await readJson(new URL('./fixtures/daily-bundle.valid.json', import.meta.url).pathname)) as DailyBundle;
    const traversal = { ...bundle, dailyReport: { ...bundle.dailyReport, path: '../etc/passwd.md' } };
    const absolute = { ...bundle, dailyReport: { ...bundle.dailyReport, path: '/reports/daily/x.md' } };
    expect(v.validate('daily-bundle', traversal).valid).toBe(false);
    expect(v.validate('daily-bundle', absolute).valid).toBe(false);
    const badStatus = structuredClone(bundle) as unknown as { studyQueue: { candidates: { status: string }[] } };
    badStatus.studyQueue.candidates[0]!.status = 'done';
    expect(v.validate('daily-bundle', badStatus).valid).toBe(false);
  });

  it('throw on unknown schema name', () => {
    expect(() => v.validate('nope', {})).toThrow(/Unknown schema/);
  });
});

describe('config files', () => {
  it('load and validate', async () => {
    const d = await loadDiscoveryConfig(paths.config.discovery);
    expect(d.topics).toContain('mcp');
    expect(d.minimum_stars).toBe(100);
    expect(d.ranking.top_n).toBe(10);
    const p = await loadStudyPolicy(paths.config.studyPolicy);
    expect(p.max_daily_drafts).toBe(3);
    expect(p.priority.growth_24h).toBe(40);
  });
});
