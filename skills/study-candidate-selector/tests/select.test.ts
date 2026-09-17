import { describe, expect, it } from 'vitest';
import type { RankingEntry, RankingResult, RepositoryInfo } from '../../../src/core/types.js';
import { parseStudyPolicy, type StudyPolicy } from '../../../src/core/config.js';
import {
  buildCandidatePool,
  markNotStudyable,
  selectedRepositories,
  selectStudyCandidates,
  skipStatus,
  weightedPriority,
  type SelectorInput,
} from '../scripts/select.js';

const policy: StudyPolicy = parseStudyPolicy(`
max_daily_drafts: 3
priority: { growth_24h: 40, repeated_top10: 25, total_stars: 20, new_repository: 15 }
repeated_top10_window_days: 7
skip_if: { study_exists: true, pr_open: true }
`);

const info = (repository: string, stars: number, delta24h: number | null): RepositoryInfo => ({
  repository,
  url: `https://github.com/${repository}`,
  description: null,
  stars,
  previousStars: delta24h === null ? null : stars - delta24h,
  delta24h,
  firstSeen: '2026-09-17',
  isNew: delta24h === null,
});
const ranked = (items: RepositoryInfo[]): RankingEntry[] => items.map((r, i) => ({ ...r, rank: i + 1 }));

const A = info('o/a', 50000, 100);
const B = info('o/b', 20000, 1000);
const C = info('o/c', 10000, 500);
const D = info('o/d', 5000, 0);
const N = info('o/new', 800, null);

const rankings: RankingResult = {
  totalStarsTop10: ranked([A, B, C, D]),
  growth24hTop10: ranked([B, C, A]),
  newlyDiscovered: [N],
};

const input = (over: Partial<SelectorInput> = {}): SelectorInput => ({ date: '2026-09-17', rankings, policy, ...over });

describe('buildCandidatePool', () => {
  it('merges duplicates across rankings', () => {
    const pool = buildCandidatePool(rankings);
    expect(pool.map((p) => p.info.repository).sort()).toEqual(['o/a', 'o/b', 'o/c', 'o/d', 'o/new']);
    expect(pool.find((p) => p.info.repository === 'o/new')!.inTodayTop10).toBe(false);
  });

  it('returns an empty pool for empty rankings', () => {
    expect(buildCandidatePool({ totalStarsTop10: [], growth24hTop10: [], newlyDiscovered: [] })).toEqual([]);
  });
});

describe('selectStudyCandidates', () => {
  it('selects at most max_daily_drafts candidates', () => {
    const q = selectStudyCandidates(input());
    expect(q.candidates.filter((c) => c.status === 'selected')).toHaveLength(3);
    expect(q.candidates.filter((c) => c.status === 'queued')).toHaveLength(2);
    expect(q.maxDailyDrafts).toBe(3);
  });

  it('orders by priority (growth weighted highest)', () => {
    const q = selectStudyCandidates(input());
    expect(selectedRepositories(q)).toEqual(['o/b', 'o/c', 'o/a']);
    const prios = q.candidates.map((c) => c.priority);
    expect([...prios].sort((x, y) => y - x)).toEqual(prios);
  });

  it('computes priority from normalized weighted scores', () => {
    const q = selectStudyCandidates(input());
    const b = q.candidates.find((c) => c.repository === 'o/b')!;
    // growth 1*40 + repeated (1/7)*25 + stars log-ratio*20
    const starScore = Math.log10(20001) / Math.log10(50001);
    expect(b.priority).toBeCloseTo(40 + 25 / 7 + starScore * 20, 2);
    expect(b.reasons).toEqual(['growth_24h: +1000 stars', 'repeated_top10: 1/7 days', 'total_stars: 20000']);
  });

  it('scores new repositories with the new_repository weight and no growth', () => {
    const q = selectStudyCandidates(input());
    const n = q.candidates.find((c) => c.repository === 'o/new')!;
    expect(n.reasons).toContain('new_repository');
    expect(n.reasons.some((r) => r.startsWith('growth_24h'))).toBe(false);
    expect(n.reasons.some((r) => r.startsWith('repeated_top10'))).toBe(false);
  });

  it('gives zero growth score for zero or negative delta', () => {
    const neg = info('o/neg', 9000, -20);
    const q = selectStudyCandidates(
      input({ rankings: { totalStarsTop10: ranked([D, neg]), growth24hTop10: [], newlyDiscovered: [] } }),
    );
    for (const c of q.candidates) expect(c.reasons.some((r) => r.startsWith('growth_24h'))).toBe(false);
  });

  it('skips repositories whose study already exists', () => {
    const q = selectStudyCandidates(input({ studyStates: { 'o/b': { studyExists: true, prOpen: false } } }));
    const b = q.candidates.find((c) => c.repository === 'o/b')!;
    expect(b.status).toBe('skipped_study_exists');
    expect(b.reasons).toContain('skip: study_exists');
    expect(selectedRepositories(q)).toEqual(['o/c', 'o/a', 'o/new']);
    expect(q.candidates.at(-1)!.repository).toBe('o/b');
  });

  it('skips repositories with an open PR', () => {
    const q = selectStudyCandidates(input({ studyStates: { 'O/C': { studyExists: false, prOpen: true } } }));
    expect(q.candidates.find((c) => c.repository === 'o/c')!.status).toBe('skipped_pr_open');
    expect(selectedRepositories(q)).not.toContain('o/c');
  });

  it('skips repositories judged not studyable', () => {
    const q = selectStudyCandidates(input({ studyStates: { 'o/b': { studyExists: false, prOpen: false, notStudyable: true } } }));
    const b = q.candidates.find((c) => c.repository === 'o/b')!;
    expect(b.status).toBe('skipped_not_studyable');
    expect(b.reasons).toContain('skip: not_studyable');
    expect(selectedRepositories(q)).toEqual(['o/c', 'o/a', 'o/new']);
  });

  it('does not skip when the policy disables the rule', () => {
    const relaxed = { ...policy, skip_if: { study_exists: false, pr_open: false, not_studyable: false } };
    const q = selectStudyCandidates(
      input({ policy: relaxed, studyStates: { 'o/b': { studyExists: true, prOpen: true } } }),
    );
    expect(q.candidates.find((c) => c.repository === 'o/b')!.status).toBe('selected');
  });

  it('selects all candidates when there are fewer than max_daily_drafts', () => {
    const q = selectStudyCandidates(
      input({ rankings: { totalStarsTop10: ranked([A]), growth24hTop10: [], newlyDiscovered: [] } }),
    );
    expect(q.candidates).toEqual([expect.objectContaining({ repository: 'o/a', status: 'selected' })]);
  });

  it('returns an empty queue for empty rankings', () => {
    const q = selectStudyCandidates(input({ rankings: { totalStarsTop10: [], growth24hTop10: [], newlyDiscovered: [] } }));
    expect(q.candidates).toEqual([]);
  });

  it('selects nothing when every candidate is skipped', () => {
    const all = Object.fromEntries(['o/a', 'o/b', 'o/c', 'o/d', 'o/new'].map((r) => [r, { studyExists: true, prOpen: false }]));
    const q = selectStudyCandidates(input({ studyStates: all }));
    expect(selectedRepositories(q)).toEqual([]);
  });

  it('respects max_daily_drafts = 0', () => {
    const q = selectStudyCandidates(input({ policy: { ...policy, max_daily_drafts: 0 } }));
    expect(selectedRepositories(q)).toEqual([]);
  });

  it('uses ranking history for repeated_top10 and caps it at 1', () => {
    const q = selectStudyCandidates(input({ history: { 'o/d': { top10Days: 30 } } }));
    const d = q.candidates.find((c) => c.repository === 'o/d')!;
    expect(d.reasons).toContain('repeated_top10: 30/7 days');
    const starScore = Math.log10(5001) / Math.log10(50001);
    expect(d.priority).toBeCloseTo(25 + starScore * 20, 2);
  });

  it('is deterministic and breaks ties by stars then name', () => {
    const x = info('x/tie', 100, null);
    const y = info('a/tie', 100, null);
    const r: RankingResult = { totalStarsTop10: [], growth24hTop10: [], newlyDiscovered: [x, y] };
    const q1 = selectStudyCandidates(input({ rankings: r }));
    const q2 = selectStudyCandidates(input({ rankings: { ...r, newlyDiscovered: [y, x] } }));
    expect(q1).toEqual(q2);
    expect(q1.candidates.map((c) => c.repository)).toEqual(['a/tie', 'x/tie']);
  });
});

describe('markNotStudyable', () => {
  const base = selectStudyCandidates(input({ studyStates: { 'o/d': { studyExists: true, prOpen: false } } }));
  // base: selected b,c,a · queued new · skipped d

  it('replaces a selected candidate with the next queued one', () => {
    const { queue, promoted } = markNotStudyable(base, 'O/C');
    expect(promoted).toBe('o/new');
    expect(selectedRepositories(queue)).toEqual(['o/b', 'o/a', 'o/new']);
    const c = queue.candidates.find((x) => x.repository === 'o/c')!;
    expect(c.status).toBe('skipped_not_studyable');
    expect(c.reasons.at(-1)).toBe('skip: not_studyable');
    // skip 후보는 priority 순서: c(40.6) 가 d(19.3) 보다 앞
    expect(queue.candidates.map((x) => x.status)).toEqual([
      'selected', 'selected', 'selected', 'skipped_not_studyable', 'skipped_study_exists',
    ]);
  });

  it('does not mutate the input queue', () => {
    const before = structuredClone(base);
    markNotStudyable(base, 'o/c');
    expect(base).toEqual(before);
  });

  it('promotes nothing when no queued candidate remains', () => {
    const first = markNotStudyable(base, 'o/b').queue; // new 승격
    const { queue, promoted } = markNotStudyable(first, 'o/c');
    expect(promoted).toBeNull();
    expect(selectedRepositories(queue)).toEqual(['o/a', 'o/new']);
  });

  it('marks queued or skipped candidates without promotion and is idempotent', () => {
    const r1 = markNotStudyable(base, 'o/new');
    expect(r1.promoted).toBeNull();
    expect(selectedRepositories(r1.queue)).toEqual(['o/b', 'o/c', 'o/a']);
    const r2 = markNotStudyable(r1.queue, 'o/new');
    expect(r2.queue).toEqual(r1.queue);
    const r3 = markNotStudyable(base, 'o/d');
    expect(r3.queue.candidates.find((x) => x.repository === 'o/d')!.status).toBe('skipped_not_studyable');
  });

  it('throws for unknown repositories', () => {
    expect(() => markNotStudyable(base, 'x/y')).toThrow(/Not in study queue/);
  });
});

describe('helpers', () => {
  it('skipStatus prefers study_exists over pr_open', () => {
    expect(skipStatus({ studyExists: true, prOpen: true }, policy.skip_if)).toBe('skipped_study_exists');
    expect(skipStatus(undefined, policy.skip_if)).toBeNull();
  });

  it('weightedPriority rounds to 2 decimals', () => {
    expect(
      weightedPriority({ growth24h: 1 / 3, repeatedTop10: 0, totalStars: 0, newRepository: 0 }, policy.priority),
    ).toBe(13.33);
  });
});

describe('config', () => {
  it('applies defaults and rejects invalid policy', () => {
    const p = parseStudyPolicy('max_daily_drafts: 1\npriority: { growth_24h: 1, repeated_top10: 1, total_stars: 1, new_repository: 1 }');
    expect(p.repeated_top10_window_days).toBe(7);
    expect(p.skip_if).toEqual({ study_exists: true, pr_open: true, not_studyable: true });
    expect(() => parseStudyPolicy('max_daily_drafts: -1')).toThrow();
  });
});
