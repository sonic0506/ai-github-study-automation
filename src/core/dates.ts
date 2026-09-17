import type { IsoDate } from './types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(date: string): asserts date is IsoDate {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`Invalid date (YYYY-MM-DD): ${date}`);
  }
}

/** date 에 days 를 더한 ISO 날짜 (음수 가능) */
export function addDays(date: IsoDate, days: number): IsoDate {
  assertIsoDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
