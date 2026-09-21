import { describe, expect, it } from 'vitest';
import { maskToken, parseEnv, studyRepositoryOf, todayIn } from '../src/core/env.js';
import { getProjectPaths } from '../src/core/paths.js';

describe('env', () => {
  it('applies defaults and treats blank token as missing', () => {
    const env = parseEnv({ GITHUB_TOKEN: '   ' });
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.GITHUB_API_BASE_URL).toBe('https://api.github.com');
    expect(env.GITHUB_MAX_RETRIES).toBe(3);
    expect(env.AGS_TIMEZONE).toBe('Asia/Seoul');
  });

  it('coerces numeric values and rejects invalid ones', () => {
    expect(parseEnv({ GITHUB_MAX_RETRIES: '5' }).GITHUB_MAX_RETRIES).toBe(5);
    expect(() => parseEnv({ GITHUB_MAX_RETRIES: 'abc' })).toThrow(/GITHUB_MAX_RETRIES/);
    expect(() => parseEnv({ GITHUB_API_BASE_URL: 'not a url' })).toThrow(/GITHUB_API_BASE_URL/);
  });

  it('masks tokens', () => {
    expect(maskToken(undefined)).toBe('(none)');
    expect(maskToken('short')).toBe('****');
    expect(maskToken('github_pat_1234567890abcd')).toBe('gith…abcd');
  });

  it('computes today in the configured time zone', () => {
    const utcEvening = new Date('2026-09-16T21:30:00Z'); // KST 2026-09-17 06:30
    expect(todayIn('Asia/Seoul', utcEvening)).toBe('2026-09-17');
    expect(todayIn('UTC', utcEvening)).toBe('2026-09-16');
  });

  it('resolves data dir override', () => {
    const p = getProjectPaths('/proj', 'output/local-data');
    expect(p.data.registry).toBe('/proj/output/local-data/registry.json');
    expect(p.data.snapshots).toBe('/proj/output/local-data/snapshots');
    expect(getProjectPaths('/proj', 'data').data.dir).toBe('/proj/data');
  });

  it('picks the study repository from AGS_STUDY_REPOSITORY, then GITHUB_REPOSITORY', () => {
    expect(studyRepositoryOf(parseEnv({ AGS_STUDY_REPOSITORY: 'me/study', GITHUB_REPOSITORY: 'ci/repo' }))).toBe('me/study');
    expect(studyRepositoryOf(parseEnv({ GITHUB_REPOSITORY: 'ci/repo' }))).toBe('ci/repo');
    expect(studyRepositoryOf(parseEnv({}))).toBeUndefined();
  });
});
