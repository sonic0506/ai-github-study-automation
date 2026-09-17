import { describe, expect, it } from 'vitest';
import { FixtureGitHubAdapter, type GitHubRepoItem } from '../../../src/adapters/github.js';
import { GitHubRateLimitError } from '../../../src/adapters/github-rest.js';
import { parseDiscoveryConfig, type DiscoveryConfig } from '../../../src/core/config.js';
import { buildQueries, discoverRepositories } from '../scripts/discover.js';

const config: DiscoveryConfig = parseDiscoveryConfig(`
topics: [llm, rag]
minimum_stars: 100
search: { max_results_per_topic: 3, pushed_within_days: 180, exclude_archived: true, exclude_forks: true }
new_repositories: { enabled: true, created_within_days: 30, minimum_stars: 50, max_results_per_topic: 2 }
tracking: { registered: true, max_lookups: 10 }
`);

const DATE = '2026-09-17';

const repo = (full_name: string, stars: number, extra: Partial<GitHubRepoItem> = {}): GitHubRepoItem => ({
  full_name,
  html_url: `https://github.com/${full_name}`,
  description: `${full_name} desc`,
  stargazers_count: stars,
  topics: ['llm'],
  language: 'Python',
  pushed_at: '2026-09-15T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  archived: false,
  fork: false,
  ...extra,
});

const universe: GitHubRepoItem[] = [
  repo('big/one', 90000),
  repo('big/two', 80000, { topics: ['llm', 'rag'] }),
  repo('big/three', 70000),
  repo('big/four', 60000), // topic 검색 limit(3) 밖 → 수집 안 됨
  repo('rag/only', 5000, { topics: ['rag'] }),
  repo('fresh/rocket', 3000, { created_at: '2026-09-10T00:00:00Z' }), // 신규 검색으로만 잡힘? (topic 검색 limit 밖)
  repo('fresh/small', 60, { created_at: '2026-09-12T00:00:00Z' }), // 신규 기준(50)만 통과
  repo('stale/old', 20000, { pushed_at: '2025-01-01T00:00:00Z' }), // push 오래됨 → 검색 제외
  repo('arch/ived', 50000, { archived: true }),
  repo('reg/dropped', 40, { pushed_at: '2025-01-01T00:00:00Z' }), // 등록됨, 검색 기준 미달 → 추적으로 수집
  repo('reg/archived', 900, { archived: true }),
];

describe('buildQueries', () => {
  it('builds topic and new-repository queries from config', () => {
    expect(buildQueries(config, DATE)).toEqual([
      { kind: 'topic', topic: 'llm', q: 'topic:llm stars:>=100 pushed:>=2026-03-21 archived:false fork:false', limit: 3 },
      { kind: 'topic', topic: 'rag', q: 'topic:rag stars:>=100 pushed:>=2026-03-21 archived:false fork:false', limit: 3 },
      { kind: 'new', topic: 'llm', q: 'topic:llm stars:>=50 created:>=2026-08-18 archived:false fork:false', limit: 2 },
      { kind: 'new', topic: 'rag', q: 'topic:rag stars:>=50 created:>=2026-08-18 archived:false fork:false', limit: 2 },
    ]);
  });

  it('omits optional qualifiers when disabled', () => {
    const cfg = parseDiscoveryConfig({
      topics: ['mcp'],
      minimum_stars: 10,
      search: { pushed_within_days: 0, exclude_archived: false, exclude_forks: false },
      new_repositories: { enabled: false },
    });
    expect(buildQueries(cfg, DATE)).toEqual([{ kind: 'topic', topic: 'mcp', q: 'topic:mcp stars:>=10', limit: 50 }]);
  });
});

describe('discoverRepositories', () => {
  it('combines topic search, new-repository search and registered tracking', async () => {
    const adapter = new FixtureGitHubAdapter(universe);
    const { output, stats } = await discoverRepositories({
      date: DATE,
      config,
      adapter,
      registered: ['big/one', 'REG/Dropped', 'reg/archived', 'reg/deleted', 'reg/dropped'],
    });
    expect(output.date).toBe(DATE);
    expect(output.repositories.map((r) => r.repository)).toEqual([
      'big/one', 'big/three', 'big/two', 'fresh/rocket', 'fresh/small', 'rag/only', 'reg/dropped',
    ]);
    expect(output.repositories.find((r) => r.repository === 'big/two')!.topics).toEqual(['llm', 'rag']);
    expect(stats).toEqual({
      queries: 4,
      rawResults: { topic: 5, new: 2 },
      searched: 6,
      tracking: {
        candidates: 3,
        checked: 3,
        added: ['reg/dropped'],
        missing: ['reg/deleted'],
        archived: ['reg/archived'],
        skippedOverLimit: 0,
        stoppedByRateLimit: 0,
      },
      total: 7,
    });
    // 이미 검색된 big/one 은 개별 조회하지 않음 (대소문자 중복도 1회)
    expect(adapter.lookups).toEqual(['reg/archived', 'reg/deleted', 'REG/Dropped']);
  });

  it('respects max_lookups and disabled tracking', async () => {
    const limited = { ...config, tracking: { registered: true, max_lookups: 1 } };
    const a = await discoverRepositories({ date: DATE, config: limited, adapter: new FixtureGitHubAdapter(universe), registered: ['x/1', 'x/2', 'x/3'] });
    expect(a.stats.tracking).toMatchObject({ candidates: 3, checked: 1, skippedOverLimit: 2, missing: ['x/1'] });

    const off = { ...config, tracking: { registered: false, max_lookups: 10 } };
    const adapter = new FixtureGitHubAdapter(universe);
    const b = await discoverRepositories({ date: DATE, config: off, adapter, registered: ['reg/dropped'] });
    expect(adapter.lookups).toEqual([]);
    expect(b.stats.tracking).toMatchObject({ candidates: 1, checked: 0, skippedOverLimit: 0 });
  });

  it('stops tracking (but keeps search results) when the rate limit is exhausted', async () => {
    const adapter = new FixtureGitHubAdapter(universe);
    let calls = 0;
    adapter.getRepository = async (id) => {
      if (++calls === 2) throw new GitHubRateLimitError(`/repos/${id}`, 3_600_000);
      return universe.find((u) => u.full_name === id) ?? null;
    };
    const { output, stats } = await discoverRepositories({
      date: DATE, config, adapter, registered: ['reg/dropped', 'x/2', 'x/3'],
    });
    expect(stats.tracking).toMatchObject({ checked: 1, added: ['reg/dropped'], stoppedByRateLimit: 2 });
    expect(output.repositories).toHaveLength(7);
  });

  it('rethrows non rate-limit errors during tracking', async () => {
    const adapter = new FixtureGitHubAdapter(universe);
    adapter.getRepository = async () => {
      throw new Error('boom');
    };
    await expect(discoverRepositories({ date: DATE, config, adapter, registered: ['x/1'] })).rejects.toThrow('boom');
  });

  it('does not duplicate a renamed repository already found by search', async () => {
    const adapter = new FixtureGitHubAdapter(universe);
    // 옛 이름으로 등록되어 있지만 조회 결과가 이미 수집된 big/one 인 경우
    adapter.getRepository = async () => universe[0]!;
    const { output, stats } = await discoverRepositories({ date: DATE, config, adapter, registered: ['old/name'] });
    expect(output.repositories.filter((r) => r.repository === 'big/one')).toHaveLength(1);
    expect(stats.tracking.added).toEqual([]);
  });

  it('works with no results at all', async () => {
    const { output, stats } = await discoverRepositories({ date: DATE, config, adapter: new FixtureGitHubAdapter([]) });
    expect(output.repositories).toEqual([]);
    expect(stats.total).toBe(0);
  });

  it('reports progress', async () => {
    const messages: string[] = [];
    await discoverRepositories({ date: DATE, config, adapter: new FixtureGitHubAdapter(universe), onProgress: (m) => messages.push(m) });
    expect(messages[0]).toBe('[1/4] topic topic:llm stars:>=100 pushed:>=2026-03-21 archived:false fork:false');
    expect(messages).toHaveLength(4);
  });
});
