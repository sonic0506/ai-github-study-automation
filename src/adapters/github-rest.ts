import type { GitHubReadAdapter, GitHubRepoItem } from './github.js';

/**
 * GitHub REST API 클라이언트 (읽기 전용).
 * - Search API: per_page 최대 100, 검색당 최대 1,000건
 * - rate limit: 응답 헤더(x-ratelimit-*, retry-after)를 보고 기다리거나 실패
 * - 5xx / 네트워크 오류: 지수 backoff 재시도
 * fetch / sleep / now 를 주입받아 네트워크 없이 테스트할 수 있다.
 */

export interface GitHubRestOptions {
  token?: string;
  baseUrl?: string;
  apiVersion?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxRateLimitWaitMs?: number;
  userAgent?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onEvent?: (event: GitHubClientEvent) => void;
}

export type GitHubClientEvent =
  | { type: 'request'; path: string; attempt: number }
  | { type: 'retry'; path: string; reason: string; waitMs: number }
  | { type: 'rate-limit-wait'; path: string; waitMs: number };

export interface RateLimitState {
  resource: string | null;
  limit: number | null;
  remaining: number | null;
  resetAt: number | null; // epoch ms
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(`GitHub API ${status} ${path}: ${message}`);
    this.name = 'GitHubApiError';
  }
}

export class GitHubRateLimitError extends GitHubApiError {
  constructor(path: string, readonly waitMs: number) {
    super(429, path, `rate limit exceeded; reset in ${Math.ceil(waitMs / 1000)}s (exceeds max wait)`);
    this.name = 'GitHubRateLimitError';
  }
}

const SEARCH_MAX_RESULTS = 1000;
const SEARCH_MAX_PER_PAGE = 100;
const SECONDARY_LIMIT_WAIT_MS = 60_000;

type Params = Record<string, string | number>;

export interface RequestOptions {
  /** 쿼리 파라미터 */
  params?: Params;
  /** 기본 GET */
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** JSON 본문 (POST/PATCH) */
  body?: unknown;
  /** 오류 대신 null 을 반환할 상태 코드 (예: 404) */
  nullOn?: number[];
}

export class GitHubRestClient implements GitHubReadAdapter {
  readonly rateLimit: RateLimitState = { resource: null, limit: null, remaining: null, resetAt: null };
  requestCount = 0;

  private readonly o: Required<Omit<GitHubRestOptions, 'token' | 'onEvent'>> & Pick<GitHubRestOptions, 'token' | 'onEvent'>;

  constructor(options: GitHubRestOptions = {}) {
    this.o = {
      token: options.token,
      baseUrl: options.baseUrl ?? 'https://api.github.com',
      apiVersion: options.apiVersion ?? '2022-11-28',
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 3,
      maxRateLimitWaitMs: options.maxRateLimitWaitMs ?? 90_000,
      userAgent: options.userAgent ?? 'ai-github-study',
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      now: options.now ?? Date.now,
      onEvent: options.onEvent,
    };
  }

  get authenticated(): boolean {
    return Boolean(this.o.token);
  }

  async searchRepositories(q: string, limit: number): Promise<GitHubRepoItem[]> {
    const wanted = Math.min(Math.max(0, Math.floor(limit)), SEARCH_MAX_RESULTS);
    if (wanted === 0) return [];
    const perPage = Math.min(SEARCH_MAX_PER_PAGE, wanted);
    const out: GitHubRepoItem[] = [];
    for (let page = 1; out.length < wanted; page++) {
      const res = await this.request<{ total_count: number; items: unknown[] }>('/search/repositories', {
        params: { q, sort: 'stars', order: 'desc', per_page: perPage, page },
      });
      if (!res) break;
      const items = (res.items ?? []).map(pickRepo);
      out.push(...items);
      const reachedEnd = items.length < perPage || page * perPage >= Math.min(res.total_count, SEARCH_MAX_RESULTS);
      if (reachedEnd) break;
    }
    return out.slice(0, wanted);
  }

  async getRepository(fullName: string): Promise<GitHubRepoItem | null> {
    const [owner, name, ...rest] = fullName.split('/');
    if (!owner || !name || rest.length) throw new Error(`Invalid repository id: ${fullName}`);
    const res = await this.request<unknown>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
      nullOn: [404, 451],
    });
    return res ? pickRepo(res) : null;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
    const { params = {}, method = 'GET', body, nullOn = [] } = options;
    const url = new URL(path.replace(/^\//, ''), this.o.baseUrl.endsWith('/') ? this.o.baseUrl : `${this.o.baseUrl}/`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      this.o.onEvent?.({ type: 'request', path, attempt });
      let res: Response;
      try {
        this.requestCount++;
        res = await this.o.fetch(url, {
          method,
          headers: body === undefined ? this.headers() : { ...this.headers(), 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.o.timeoutMs),
        });
      } catch (err) {
        if (attempt >= this.o.maxRetries) throw new GitHubApiError(0, path, `network error: ${(err as Error).message}`);
        await this.wait(path, backoff(attempt), `network error: ${(err as Error).message}`);
        continue;
      }

      this.updateRateLimit(res.headers);
      if (res.ok) return res.status === 204 ? (null as T) : ((await res.json()) as T);
      if (nullOn.includes(res.status)) return null;

      const message = await readMessage(res);
      const rateWait = this.rateLimitWait(res, message);
      if (rateWait !== null) {
        if (rateWait > this.o.maxRateLimitWaitMs) throw new GitHubRateLimitError(path, rateWait);
        if (attempt >= this.o.maxRetries) throw new GitHubApiError(res.status, path, `rate limited: ${message}`);
        this.o.onEvent?.({ type: 'rate-limit-wait', path, waitMs: rateWait });
        await this.o.sleep(rateWait);
        continue;
      }
      if (res.status >= 500 && attempt < this.o.maxRetries) {
        await this.wait(path, backoff(attempt), `HTTP ${res.status}`);
        continue;
      }
      throw new GitHubApiError(res.status, path, message);
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.o.apiVersion,
      'User-Agent': this.o.userAgent,
    };
    if (this.o.token) h.Authorization = `Bearer ${this.o.token}`;
    return h;
  }

  private updateRateLimit(h: Headers): void {
    const num = (k: string) => (h.get(k) === null ? null : Number(h.get(k)));
    if (h.get('x-ratelimit-limit') === null) return;
    this.rateLimit.resource = h.get('x-ratelimit-resource');
    this.rateLimit.limit = num('x-ratelimit-limit');
    this.rateLimit.remaining = num('x-ratelimit-remaining');
    const reset = num('x-ratelimit-reset');
    this.rateLimit.resetAt = reset === null ? null : reset * 1000;
  }

  /** rate limit 응답이면 기다릴 시간(ms), 아니면 null */
  private rateLimitWait(res: Response, message: string): number | null {
    if (res.status !== 403 && res.status !== 429) return null;
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter !== null && Number.isFinite(Number(retryAfter))) return Number(retryAfter) * 1000;
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      return Number.isFinite(reset) ? Math.max(0, reset * 1000 - this.o.now()) + 1000 : SECONDARY_LIMIT_WAIT_MS;
    }
    if (res.status === 429 || /rate limit/i.test(message)) return SECONDARY_LIMIT_WAIT_MS;
    return null; // 일반 403 (권한 없음 등)
  }

  private async wait(path: string, waitMs: number, reason: string): Promise<void> {
    this.o.onEvent?.({ type: 'retry', path, reason, waitMs });
    await this.o.sleep(waitMs);
  }
}

const backoff = (attempt: number) => 1000 * 2 ** attempt;

async function readMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

function pickRepo(raw: unknown): GitHubRepoItem {
  const r = raw as Record<string, unknown>;
  if (typeof r.full_name !== 'string' || typeof r.stargazers_count !== 'number') {
    throw new Error('Unexpected repository payload from GitHub');
  }
  return {
    full_name: r.full_name,
    html_url: String(r.html_url ?? `https://github.com/${r.full_name}`),
    description: (r.description as string | null) ?? null,
    stargazers_count: r.stargazers_count,
    topics: Array.isArray(r.topics) ? (r.topics as string[]) : [],
    language: (r.language as string | null) ?? null,
    pushed_at: (r.pushed_at as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
    archived: Boolean(r.archived),
    fork: Boolean(r.fork),
  };
}
