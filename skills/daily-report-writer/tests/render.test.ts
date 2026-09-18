import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseReportConfig, type ReportConfig } from '../../../src/core/config.js';
import type { RankingEntry, RepositoryInfo, StudyQueue } from '../../../src/core/types.js';
import { baselineLabel, cleanDescription, formatDelta, renderDailyReport, type RenderInput } from '../scripts/render.js';

const root = new URL('../../../', import.meta.url);
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, root)), 'utf8');
const templates = { report: read('templates/daily-report.md'), telegram: read('templates/telegram-daily.md') };
const config: ReportConfig = parseReportConfig(read('config/report.yml'));

const info = (repository: string, stars: number, delta24h: number | null, description: string | null = `${repository} 설명`): RepositoryInfo => ({
  repository,
  url: `https://github.com/${repository}`,
  description,
  stars,
  previousStars: delta24h === null ? null : stars - delta24h,
  delta24h,
  firstSeen: '2026-09-18',
  isNew: delta24h === null,
});
const ranked = (items: RepositoryInfo[]): RankingEntry[] => items.map((r, i) => ({ ...r, rank: i + 1 }));

const queue: StudyQueue = {
  version: 1,
  date: '2026-09-18',
  maxDailyDrafts: 3,
  candidates: [
    { repository: 'acme/agent-kit', priority: 55.77, reasons: ['growth_24h: +210 stars'], status: 'selected' },
    { repository: 'acme/rag-engine', priority: 44.73, reasons: ['total_stars: 31050'], status: 'queued' },
    { repository: 'list/awesome-ai', priority: 33.38, reasons: ['new_repository', 'skip: not_studyable'], status: 'skipped_not_studyable' },
  ],
};

const input = (over: Partial<RenderInput> = {}): RenderInput => ({
  date: '2026-09-18',
  baseline: { date: '2026-09-17', gapDays: 1 },
  rankings: {
    totalStarsTop10: ranked([info('acme/agent-kit', 48210, 210), info('acme/rag-engine', 31050, 0)]),
    growth24hTop10: ranked([info('acme/agent-kit', 48210, 210)]),
    newlyDiscovered: [info('zen/new-agent', 1800, null)],
  },
  studyQueue: queue,
  repositoryCount: 347,
  config,
  templates,
  ...over,
});

describe('helpers', () => {
  it('formats deltas with sign and NEW', () => {
    expect([formatDelta(1234), formatDelta(0), formatDelta(-5), formatDelta(null)]).toEqual(['+1,234', '0', '-5', 'NEW']);
  });

  it('cleans descriptions for markdown tables', () => {
    expect(cleanDescription('a | b\n c', 80)).toBe('a \\| b c');
    expect(cleanDescription(null, 80)).toBe('-');
    expect(cleanDescription('   ', 80)).toBe('-');
    expect(cleanDescription('가'.repeat(100), 10)).toBe(`${'가'.repeat(9)}…`);
    expect(cleanDescription('abcdefghij', 10)).toBe('abcdefghij');
  });

  it('labels the baseline', () => {
    expect(baselineLabel({ date: '2026-09-17', gapDays: 1 })).toBe('2026-09-17 (전날)');
    expect(baselineLabel({ date: '2026-09-14', gapDays: 4 })).toBe('2026-09-14 (4일 전)');
    expect(baselineLabel(null)).toMatch(/첫 수집/);
  });
});

describe('renderDailyReport', () => {
  it('copies ranks, stars and deltas from the input without recalculating', () => {
    const { dailyReport } = renderDailyReport(input());
    expect(dailyReport.path).toBe('reports/daily/2026-09-18.md');
    expect(dailyReport.markdown).toContain('| 1 | [acme/agent-kit](https://github.com/acme/agent-kit) | 48,210 | +210 | acme/agent-kit 설명 |');
    expect(dailyReport.markdown).toContain('| 2 | [acme/rag-engine](https://github.com/acme/rag-engine) | 31,050 | 0 |');
    expect(dailyReport.markdown).toContain('비교 기준: 2026-09-17 (전날)');
    expect(dailyReport.markdown).toContain('수집 347개 · 신규 1개 · 오늘의 Study 1개');
  });

  it('lists only selected candidates under 오늘의 Study and all of them in the details table', () => {
    const md = renderDailyReport(input()).dailyReport.markdown;
    const section = md.slice(md.indexOf('## 📚'), md.indexOf('<details>'));
    expect(section).toContain('acme/agent-kit');
    expect(section).not.toContain('acme/rag-engine');
    expect(md).toContain('| acme/rag-engine | 44.73 | queued |');
    expect(md).toContain('| list/awesome-ai | 33.38 | skipped_not_studyable |');
    expect(md).toContain('Study Queue 전체 (3개)');
  });

  it('caps the newly discovered list and reports the remainder', () => {
    const many = Array.from({ length: 25 }, (_, i) => info(`n/r${String(i).padStart(2, '0')}`, 1000 - i, null));
    const md = renderDailyReport(
      input({ rankings: { ...input().rankings, newlyDiscovered: many } }),
    ).dailyReport.markdown;
    expect(md).toContain('## 🆕 신규 발견 25개');
    expect(md.match(/^- \[n\//gm)).toHaveLength(10);
    expect(md).toContain('외 15개는');
    expect(md).not.toContain('n/r10');
  });

  it('explains the first run instead of showing an empty growth table', () => {
    const md = renderDailyReport(
      input({ baseline: null, rankings: { ...input().rankings, growth24hTop10: [] } }),
    ).dailyReport.markdown;
    expect(md).toContain('비교할 이전 기록이 없어');
    expect(md).toContain('첫 수집이라 모든 저장소가 신규로 잡혔다.');
    expect(md).not.toContain('| # | Repository | ⭐ Stars | Δ | 설명 |\n|---:|---|---:|---:|---|\n\n');
  });

  it('handles empty rankings and an empty queue', () => {
    const md = renderDailyReport(
      input({
        rankings: { totalStarsTop10: [], growth24hTop10: [], newlyDiscovered: [] },
        studyQueue: { ...queue, candidates: [] },
        repositoryCount: 0,
      }),
    ).dailyReport.markdown;
    expect(md).toContain('오늘 새로 발견한 저장소가 없다.');
    expect(md).toContain('오늘 선정된 Study 후보가 없다.');
    expect(md).toContain('기준일 대비 Star가 증가한 저장소가 없다.');
  });

  it('renders the telegram summary with the configured top count', () => {
    const { telegram } = renderDailyReport(input());
    expect(telegram.markdown).toContain('AI GitHub Daily — 2026-09-18');
    expect(telegram.markdown).not.toContain('*'); // parse_mode 없이 보내므로 서식 문자 없음
    expect(telegram.markdown).toContain('1. acme/agent-kit +210⭐');
    expect(telegram.markdown).toContain('🆕 신규 1개 · 수집 347개');
    expect(telegram.markdown).toContain('• acme/agent-kit');
    expect(telegram.markdown).toContain('📝 reports/daily/2026-09-18.md');
  });

  it('respects config overrides', () => {
    const custom = parseReportConfig({ newly_discovered_limit: 0, description_max_length: 5, telegram_growth_top: 0, report_path: 'r/{date}.md' });
    const out = renderDailyReport(input({ config: custom }));
    expect(out.dailyReport.path).toBe('r/2026-09-18.md');
    expect(out.dailyReport.markdown).toContain('외 1개는');
    expect(out.dailyReport.markdown).toContain('acme…');
    expect(out.telegram.markdown).not.toContain('1. acme/agent-kit');
  });

  it('rejects a mismatched study queue date', () => {
    expect(() => renderDailyReport(input({ studyQueue: { ...queue, date: '2026-09-17' } }))).toThrow(/must equal date/);
  });

  it('is deterministic', () => {
    expect(renderDailyReport(input())).toEqual(renderDailyReport(input()));
  });
});

describe('config', () => {
  it('validates report_path', () => {
    expect(() => parseReportConfig({ report_path: '/abs/{date}.md' })).toThrow();
    expect(() => parseReportConfig({ report_path: 'reports/daily.md' })).toThrow(/{date}/);
    expect(parseReportConfig({}).newly_discovered_limit).toBe(10);
  });
});
