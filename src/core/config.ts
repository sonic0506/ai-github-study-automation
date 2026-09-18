import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * YAML 설정 파서.
 * - 파일 I/O(loadXxx)와 파싱/검증(parseXxx)을 분리하여 Skill 런타임에서는
 *   파일 시스템 없이 문자열/객체만으로 사용할 수 있게 한다.
 */

export const DiscoveryConfigSchema = z.object({
  topics: z.array(z.string().min(1)).min(1),
  minimum_stars: z.number().int().nonnegative(),
  search: z
    .object({
      max_results_per_topic: z.number().int().positive().max(1000).default(50),
      pushed_within_days: z.number().int().nonnegative().default(0),
      exclude_archived: z.boolean().default(true),
      exclude_forks: z.boolean().default(true),
    })
    .default({}),
  new_repositories: z
    .object({
      enabled: z.boolean().default(true),
      created_within_days: z.number().int().positive().default(30),
      minimum_stars: z.number().int().nonnegative().default(100),
      max_results_per_topic: z.number().int().positive().max(1000).default(30),
    })
    .default({}),
  tracking: z
    .object({
      registered: z.boolean().default(true),
      max_lookups: z.number().int().nonnegative().default(300),
    })
    .default({}),
  exclude: z
    .object({
      repositories: z
        .array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'owner/name 형식이어야 합니다'))
        .default([]),
    })
    .default({}),
  ranking: z
    .object({
      top_n: z.number().int().positive().default(10),
      growth_min_delta: z.number().int().default(1),
    })
    .default({}),
});
export type DiscoveryConfig = z.infer<typeof DiscoveryConfigSchema>;

export const StudyPolicySchema = z.object({
  max_daily_drafts: z.number().int().nonnegative(),
  priority: z.object({
    growth_24h: z.number().nonnegative(),
    repeated_top10: z.number().nonnegative(),
    total_stars: z.number().nonnegative(),
    new_repository: z.number().nonnegative(),
  }),
  repeated_top10_window_days: z.number().int().positive().default(7),
  skip_if: z
    .object({
      study_exists: z.boolean().default(true),
      pr_open: z.boolean().default(true),
      not_studyable: z.boolean().default(true),
    })
    .default({}),
});
export type StudyPolicy = z.infer<typeof StudyPolicySchema>;

export const ReportConfigSchema = z.object({
  newly_discovered_limit: z.number().int().nonnegative().default(10),
  description_max_length: z.number().int().positive().default(80),
  telegram_growth_top: z.number().int().nonnegative().default(3),
  report_path: z
    .string()
    .regex(/^(?!\/)[A-Za-z0-9._{}/-]+\.md$/, '상대 경로여야 하며 .md 로 끝나야 합니다')
    .refine((p) => p.includes('{date}'), '{date} 를 포함해야 합니다')
    .default('reports/daily/{date}.md'),
});
export type ReportConfig = z.infer<typeof ReportConfigSchema>;

export function parseReportConfig(input: string | unknown): ReportConfig {
  return ReportConfigSchema.parse(typeof input === 'string' ? parse(input) : input);
}

export async function loadReportConfig(path: string): Promise<ReportConfig> {
  return parseReportConfig(await readFile(path, 'utf8'));
}

export function parseDiscoveryConfig(input: string | unknown): DiscoveryConfig {
  return DiscoveryConfigSchema.parse(typeof input === 'string' ? parse(input) : input);
}

export function parseStudyPolicy(input: string | unknown): StudyPolicy {
  return StudyPolicySchema.parse(typeof input === 'string' ? parse(input) : input);
}

export async function loadDiscoveryConfig(path: string): Promise<DiscoveryConfig> {
  return parseDiscoveryConfig(await readFile(path, 'utf8'));
}

export async function loadStudyPolicy(path: string): Promise<StudyPolicy> {
  return parseStudyPolicy(await readFile(path, 'utf8'));
}
