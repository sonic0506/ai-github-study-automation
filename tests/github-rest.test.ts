import { describe, expect, it } from 'vitest';
import { GitHubApiError, GitHubRateLimitError, GitHubRestClient, type GitHubRestOptions } from '../src/adapters/github-rest.js';

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error;

const repo = (i: number, extra: Record<string, unknown> = {}) => ({
  full_name: `o/r${i}`,
  html_url: `https://github.com/o/r${i}`,
  description: null,
  stargazers_count: 1000 - i,
  topics: ['llm'],
  language: 'Python',
  pushed_at: '2026-09-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  archived: false,
  fork: false,
  owner: { login: 'o' }, // 불필요 필드는 버려져야 함
  ...extra,
});

function setup(replies: Reply[], opts: GitHubRestOptions = {}) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  const queue = [...replies];
  const fetchFn = (async (input: URL | string, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), headers: init?.headers as Record<string, string> });
    const r = queue.shift();
    if (!r) throw new Error('no more fake replies');
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  const client = new GitHubRestClient({
    fetch: fetchFn,
    sleep: async (ms) => void sleeps.push(ms),
    now: () => 1_000_000_000_000,
    ...opts,
  });
  return { client, calls, sleeps };
}

describe('GitHubRestClient.searchRepositories', () => {
  it('sends auth/version headers and search params', async () => {
    const { client, calls } = setup([{ body: { total_count: 1, items: [repo(1)] } }], { token: 'secret' });
    const items = await client.searchRepositories('topic:llm stars:>=100', 50);
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty('owner');
    const { url, headers } = calls[0]!;
    expect(url.pathname).toBe('/search/repositories');
    expect(url.searchParams.get('q')).toBe('topic:llm stars:>=100');
    expect(url.searchParams.get('sort')).toBe('stars');
    expect(url.searchParams.get('per_page')).toBe('50');
    expect(headers.Authorization).toBe('Bearer secret');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(client.authenticated).toBe(true);
  });

  it('omits Authorization without a token', async () => {
    const { client, calls } = setup([{ body: { total_count: 0, items: [] } }]);
    await client.searchRepositories('topic:llm', 10);
    expect(calls[0]!.headers.Authorization).toBeUndefined();
    expect(client.authenticated).toBe(false);
  });

  it('paginates with per_page=100 until the limit', async () => {
    const page = (start: number, n: number) => Array.from({ length: n }, (_, i) => repo(start + i));
    const { client, calls } = setup([
      { body: { total_count: 500, items: page(0, 100) } },
      { body: { total_count: 500, items: page(100, 100) } },
      { body: { total_count: 500, items: page(200, 100) } },
    ]);
    const items = await client.searchRepositories('q', 250);
    expect(items).toHaveLength(250);
    expect(calls.map((c) => c.url.searchParams.get('page'))).toEqual(['1', '2', '3']);
    expect(calls[0]!.url.searchParams.get('per_page')).toBe('100');
  });

  it('stops when results run out', async () => {
    const { client, calls } = setup([{ body: { total_count: 3, items: [repo(1), repo(2), repo(3)] } }]);
    expect(await client.searchRepositories('q', 100)).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it('caps at 1000 results and returns nothing for limit 0', async () => {
    const { client, calls } = setup([]);
    expect(await client.searchRepositories('q', 0)).toEqual([]);
    expect(calls).toHaveLength(0);
    const full = Array.from({ length: 100 }, (_, i) => repo(i));
    const many = setup(Array.from({ length: 12 }, () => ({ body: { total_count: 5000, items: full } })));
    expect(await many.client.searchRepositories('q', 5000)).toHaveLength(1000);
    expect(many.calls).toHaveLength(10);
  });

  it('tracks rate limit headers', async () => {
    const { client } = setup([
      {
        body: { total_count: 0, items: [] },
        headers: { 'x-ratelimit-limit': '30', 'x-ratelimit-remaining': '29', 'x-ratelimit-reset': '1000000060', 'x-ratelimit-resource': 'search' },
      },
    ]);
    await client.searchRepositories('q', 10);
    expect(client.rateLimit).toEqual({ resource: 'search', limit: 30, remaining: 29, resetAt: 1_000_000_060_000 });
  });
});

describe('GitHubRestClient retries and errors', () => {
  const empty = { body: { total_count: 0, items: [] } };

  it('waits until reset when the primary rate limit is exhausted', async () => {
    const { client, sleeps } = setup([
      { status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1000000030' } },
      empty,
    ]);
    await client.searchRepositories('q', 10);
    expect(sleeps).toEqual([31_000]);
  });

  it('honors retry-after', async () => {
    const { client, sleeps } = setup([{ status: 429, headers: { 'retry-after': '5' } }, empty]);
    await client.searchRepositories('q', 10);
    expect(sleeps).toEqual([5_000]);
  });

  it('waits a minute on secondary rate limits without headers', async () => {
    const { client, sleeps } = setup([{ status: 403, body: { message: 'You have exceeded a secondary rate limit' } }, empty]);
    await client.searchRepositories('q', 10);
    expect(sleeps).toEqual([60_000]);
  });

  it('fails fast when the reset is beyond the max wait', async () => {
    const { client, sleeps } = setup(
      [{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1000003600' } }],
      { maxRateLimitWaitMs: 60_000 },
    );
    await expect(client.searchRepositories('q', 10)).rejects.toBeInstanceOf(GitHubRateLimitError);
    expect(sleeps).toEqual([]);
  });

  it('retries 5xx and network errors with exponential backoff', async () => {
    const { client, sleeps } = setup([{ status: 502 }, new TypeError('fetch failed'), empty]);
    await client.searchRepositories('q', 10);
    expect(sleeps).toEqual([1000, 2000]);
    expect(client.requestCount).toBe(3);
  });

  it('gives up after maxRetries', async () => {
    const { client } = setup([{ status: 500 }, { status: 500 }], { maxRetries: 1 });
    await expect(client.searchRepositories('q', 10)).rejects.toMatchObject({ status: 500 });
  });

  it('does not retry plain 403 or 422', async () => {
    const forbidden = setup([{ status: 403, body: { message: 'Resource not accessible' } }]);
    await expect(forbidden.client.searchRepositories('q', 10)).rejects.toThrow(/403.*Resource not accessible/);
    const invalid = setup([{ status: 422, body: { message: 'Validation Failed' } }]);
    await expect(invalid.client.searchRepositories('q', 10)).rejects.toBeInstanceOf(GitHubApiError);
    expect(forbidden.sleeps).toEqual([]);
  });
});

describe('GitHubRestClient.getRepository', () => {
  it('returns the repository', async () => {
    const { client, calls } = setup([{ body: repo(7) }]);
    expect(await client.getRepository('o/r7')).toMatchObject({ full_name: 'o/r7', stargazers_count: 993 });
    expect(calls[0]!.url.pathname).toBe('/repos/o/r7');
  });

  it('returns null for missing or blocked repositories', async () => {
    const { client } = setup([{ status: 404 }, { status: 451 }]);
    expect(await client.getRepository('o/gone')).toBeNull();
    expect(await client.getRepository('o/blocked')).toBeNull();
  });

  it('rejects invalid ids and unexpected payloads', async () => {
    const { client } = setup([{ body: { message: 'weird' } }]);
    await expect(client.getRepository('bad')).rejects.toThrow(/Invalid repository id/);
    await expect(client.getRepository('o/r')).rejects.toThrow(/Unexpected repository payload/);
  });

  it('supports a custom base URL (GitHub Enterprise)', async () => {
    const { client, calls } = setup([{ body: repo(1) }], { baseUrl: 'https://ghe.example.com/api/v3' });
    await client.getRepository('o/r1');
    expect(calls[0]!.url.href).toBe('https://ghe.example.com/api/v3/repos/o/r1');
  });
});
