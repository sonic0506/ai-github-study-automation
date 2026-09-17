import { existsSync } from 'node:fs';
import { z } from 'zod';

/**
 * 환경변수 로더.
 * - 로컬: 프로젝트 루트의 .env 를 읽는다 (Node 내장 process.loadEnvFile, 이미 설정된 값은 덮어쓰지 않음).
 * - CI / Cowork: 실행 환경의 환경변수를 그대로 사용한다.
 * 값의 목록과 설명은 .env.example 참고.
 */

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

export const EnvSchema = z.object({
  /** GitHub Personal Access Token (공개 저장소 읽기만 필요). 없으면 비인증 호출(검색 분당 10회) */
  GITHUB_TOKEN: optionalString,
  GITHUB_API_BASE_URL: z.string().url().default('https://api.github.com'),
  GITHUB_API_VERSION: z.string().default('2022-11-28'),
  GITHUB_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  GITHUB_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  /** rate limit 이 풀릴 때까지 기다릴 최대 시간. 넘으면 실패 처리 */
  GITHUB_MAX_RATE_LIMIT_WAIT_MS: z.coerce.number().int().min(0).default(90_000),
  /** 실행 기준 시간대 (날짜 계산) */
  AGS_TIMEZONE: z.string().default('Asia/Seoul'),
  AGS_DATA_DIR: optionalString,
  AGS_ROOT: optionalString,
});
export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment variables:\n  ${issues}`);
  }
  return result.data;
}

/** .env 파일이 있으면 process.env 에 적재한 뒤 검증된 설정을 반환한다. */
export function loadEnv(envFile = '.env'): Env {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return parseEnv(process.env);
}

/** 토큰을 로그에 남기지 않기 위한 마스킹 */
export function maskToken(token: string | undefined): string {
  if (!token) return '(none)';
  return token.length <= 8 ? '****' : `${token.slice(0, 4)}…${token.slice(-4)}`;
}

/** 시간대 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
