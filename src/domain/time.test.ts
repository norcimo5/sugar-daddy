import { describe, it, expect } from 'vitest';
import {
  localDateKey,
  startOfLocalDay,
  addLocalDays,
  rangeFor,
  shiftAnchor,
  formatRangeLabel,
  formatDateLong,
  formatTime,
  formatDateTime,
  toLocalInputValue,
  fromLocalInputValue,
  currentTimeZone,
  formatInZone,
} from './time';

/** Local wall-clock constructor (device zone = America/New_York in tests). */
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
/** Collapse ICU's narrow/no-break spaces so assertions are stable across ICU versions. */
const norm = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');
const HOUR = 3_600_000;

describe('test environment', () => {
  it('runs in America/New_York', () => {
    expect(currentTimeZone()).toBe('America/New_York');
  });
});

describe('localDateKey', () => {
  it('formats device-local date as YYYY-MM-DD with zero padding', () => {
    expect(localDateKey(local(2026, 1, 5, 9, 0))).toBe('2026-01-05');
  });

  it('uses local date, not UTC date, near midnight', () => {
    // 23:30 local on Nov 3 is 04:30 UTC on Nov 4.
    const d = local(2026, 11, 3, 23, 30);
    expect(d.toISOString().slice(0, 10)).toBe('2026-11-04');
    expect(localDateKey(d)).toBe('2026-11-03');
  });

  it('handles DST transition days', () => {
    expect(localDateKey(new Date('2026-03-08T07:30:00Z'))).toBe('2026-03-08'); // 03:30 EDT
    expect(localDateKey(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01'); // 01:30 EDT
    expect(localDateKey(new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01'); // 01:30 EST
  });
});

describe('startOfLocalDay', () => {
  it('returns local midnight', () => {
    const s = startOfLocalDay(local(2026, 6, 15, 17, 42));
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(s.getMilliseconds()).toBe(0);
    expect(localDateKey(s)).toBe('2026-06-15');
  });

  it('is correct on spring-forward day (midnight is EST)', () => {
    const s = startOfLocalDay(new Date('2026-03-08T15:00:00Z'));
    expect(s.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('is correct on fall-back day (midnight is EDT)', () => {
    const s = startOfLocalDay(new Date('2026-11-01T20:00:00Z'));
    expect(s.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('does not mutate its argument', () => {
    const d = local(2026, 6, 15, 17, 42);
    const before = d.getTime();
    startOfLocalDay(d);
    expect(d.getTime()).toBe(before);
  });
});

describe('addLocalDays', () => {
  it('keeps wall-clock time across spring forward (23h day)', () => {
    const d = local(2026, 3, 7, 9, 0);
    const r = addLocalDays(d, 1);
    expect(localDateKey(r)).toBe('2026-03-08');
    expect(r.getHours()).toBe(9);
    expect(r.getTime() - d.getTime()).toBe(23 * HOUR);
  });

  it('keeps wall-clock time across fall back (25h day)', () => {
    const d = local(2026, 10, 31, 9, 0);
    const r = addLocalDays(d, 1);
    expect(localDateKey(r)).toBe('2026-11-01');
    expect(r.getHours()).toBe(9);
    expect(r.getTime() - d.getTime()).toBe(25 * HOUR);
  });

  it('supports negative offsets and month rollover', () => {
    expect(localDateKey(addLocalDays(local(2026, 3, 1), -1))).toBe('2026-02-28');
    expect(localDateKey(addLocalDays(local(2026, 12, 31), 1))).toBe('2027-01-01');
  });

  it('does not mutate its argument', () => {
    const d = local(2026, 6, 15);
    const before = d.getTime();
    addLocalDays(d, 3);
    expect(d.getTime()).toBe(before);
  });
});

describe('rangeFor', () => {
  it('day: local midnight to next local midnight', () => {
    const r = rangeFor('day', local(2026, 6, 15, 13, 0));
    expect(r.start.getTime()).toBe(local(2026, 6, 15).getTime());
    expect(r.end.getTime()).toBe(local(2026, 6, 16).getTime());
  });

  it('day: spring-forward day is 23 hours', () => {
    const r = rangeFor('day', local(2026, 3, 8, 12, 0));
    expect(r.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('day: fall-back day is 25 hours', () => {
    const r = rangeFor('day', local(2026, 11, 1, 12, 0));
    expect(r.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('week: starts Monday, end exclusive (next Monday)', () => {
    // 2026-11-03 is a Tuesday.
    const r = rangeFor('week', local(2026, 11, 3, 10, 0));
    expect(localDateKey(r.start)).toBe('2026-11-02');
    expect(r.start.getDay()).toBe(1);
    expect(r.start.getHours()).toBe(0);
    expect(localDateKey(r.end)).toBe('2026-11-09');
    expect(r.end.getHours()).toBe(0);
  });

  it('week: Sunday belongs to the week starting the previous Monday', () => {
    // 2026-11-01 (Sunday, fall-back day).
    const r = rangeFor('week', local(2026, 11, 1, 12, 0));
    expect(localDateKey(r.start)).toBe('2026-10-26');
    expect(localDateKey(r.end)).toBe('2026-11-02');
    expect(r.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(r.end.getTime() - r.start.getTime()).toBe((7 * 24 + 1) * HOUR);
  });

  it('week: Monday anchor at midnight is its own week start', () => {
    const r = rangeFor('week', local(2026, 3, 9, 0, 0));
    expect(localDateKey(r.start)).toBe('2026-03-09');
  });

  it('week: spanning spring forward is 167 hours', () => {
    // 2026-03-08 is a Sunday; week Mar 2 – Mar 9.
    const r = rangeFor('week', local(2026, 3, 8, 12, 0));
    expect(localDateKey(r.start)).toBe('2026-03-02');
    expect(localDateKey(r.end)).toBe('2026-03-09');
    expect(r.end.getTime() - r.start.getTime()).toBe((7 * 24 - 1) * HOUR);
  });

  it('month: first of month to first of next month', () => {
    const r = rangeFor('month', local(2026, 11, 3, 10, 0));
    expect(r.start.toISOString()).toBe('2026-11-01T04:00:00.000Z'); // EDT midnight
    expect(r.end.toISOString()).toBe('2026-12-01T05:00:00.000Z'); // EST midnight
  });

  it('month: March spans spring forward; December rolls the year', () => {
    const m = rangeFor('month', local(2026, 3, 20));
    expect(m.start.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(m.end.toISOString()).toBe('2026-04-01T04:00:00.000Z');
    const d = rangeFor('month', local(2026, 12, 31, 23, 59));
    expect(localDateKey(d.start)).toBe('2026-12-01');
    expect(localDateKey(d.end)).toBe('2027-01-01');
  });
});

describe('shiftAnchor', () => {
  it('day: moves one local day keeping wall time', () => {
    const r = shiftAnchor('day', local(2026, 3, 7, 9, 0), 1);
    expect(localDateKey(r)).toBe('2026-03-08');
    expect(r.getHours()).toBe(9);
    expect(localDateKey(shiftAnchor('day', local(2026, 3, 1), -1))).toBe('2026-02-28');
  });

  it('week: moves seven local days', () => {
    expect(localDateKey(shiftAnchor('week', local(2026, 10, 28, 9), 1))).toBe('2026-11-04');
    expect(localDateKey(shiftAnchor('week', local(2026, 11, 4, 9), -1))).toBe('2026-10-28');
  });

  it('month: moves to the same month offset without day overflow', () => {
    // Jan 31 + 1 month must land in February, not March.
    const r = shiftAnchor('month', local(2026, 1, 31, 12), 1);
    expect(r.getMonth()).toBe(1);
    expect(rangeFor('month', r).start.getTime()).toBe(local(2026, 2, 1).getTime());
    expect(shiftAnchor('month', local(2026, 1, 15), -1).getFullYear()).toBe(2025);
    expect(shiftAnchor('month', local(2026, 1, 15), -1).getMonth()).toBe(11);
  });
});

describe('formatting (en-US)', () => {
  const d = local(2026, 11, 3, 14, 5);

  it('formatDateLong', () => {
    expect(norm(formatDateLong(d, 'en-US'))).toBe('Tuesday, November 3, 2026');
  });

  it('formatTime', () => {
    expect(norm(formatTime(d, 'en-US'))).toBe('2:05 PM');
  });

  it('formatDateTime', () => {
    const s = norm(formatDateTime(d, 'en-US'));
    expect(s).toContain('Nov 3, 2026');
    expect(s).toContain('2:05 PM');
  });

  it('formatters work with default locale', () => {
    expect(typeof formatDateLong(d)).toBe('string');
    expect(formatTime(d).length).toBeGreaterThan(0);
    expect(formatDateTime(d).length).toBeGreaterThan(0);
  });

  it('formatRangeLabel day', () => {
    const r = rangeFor('day', d);
    expect(norm(formatRangeLabel('day', r, 'en-US'))).toBe('Tuesday, November 3, 2026');
  });

  it('formatRangeLabel week shows Monday through Sunday (inclusive end)', () => {
    const r = rangeFor('week', d);
    const s = norm(formatRangeLabel('week', r, 'en-US'));
    expect(s).toContain('Nov 2');
    expect(s).toContain('8');
    expect(s).not.toContain('9');
    expect(s).toContain('2026');
  });

  it('formatRangeLabel month', () => {
    const r = rangeFor('month', d);
    expect(norm(formatRangeLabel('month', r, 'en-US'))).toBe('November 2026');
  });
});

describe('toLocalInputValue / fromLocalInputValue', () => {
  it('formats local wall-clock as YYYY-MM-DDTHH:mm', () => {
    expect(toLocalInputValue(local(2026, 1, 5, 7, 3))).toBe('2026-01-05T07:03');
    expect(toLocalInputValue(new Date('2026-11-04T04:30:00Z'))).toBe('2026-11-03T23:30');
  });

  it('round-trips', () => {
    const s = '2026-11-01T01:30';
    const parsed = fromLocalInputValue(s);
    expect(parsed).not.toBeNull();
    expect(toLocalInputValue(parsed as Date)).toBe(s);
  });

  it('parses as local time', () => {
    const p = fromLocalInputValue('2026-06-15T13:45');
    expect(p?.getTime()).toBe(local(2026, 6, 15, 13, 45).getTime());
  });

  it('accepts optional seconds as produced by some browsers', () => {
    expect(fromLocalInputValue('2026-06-15T13:45:30')?.getTime()).toBe(
      new Date(2026, 5, 15, 13, 45, 30).getTime(),
    );
  });

  it.each([
    '',
    'garbage',
    '2026-06-15',
    '2026-6-15T13:45',
    '2026-06-15 13:45',
    '2026-13-01T10:00',
    '2026-00-10T10:00',
    '2026-02-30T10:00',
    '2026-06-31T10:00',
    '2026-06-15T24:00',
    '2026-06-15T12:60',
    '2026-06-15T12:30:60',
    '2026-06-15T12:30Z',
    ' 2026-06-15T12:30',
  ])('rejects malformed %j', (s) => {
    expect(fromLocalInputValue(s)).toBeNull();
  });

  it('accepts Feb 29 in a leap year only', () => {
    expect(fromLocalInputValue('2028-02-29T10:00')).not.toBeNull();
    expect(fromLocalInputValue('2026-02-29T10:00')).toBeNull();
  });
});

describe('formatInZone', () => {
  it('formats an instant in the given IANA zone', () => {
    expect(formatInZone('2026-11-03T15:05:00Z', 'Asia/Tokyo')).toBe('2026-11-04 00:05');
    expect(formatInZone('2026-11-03T15:05:00Z', 'UTC')).toBe('2026-11-03 15:05');
  });

  it('uses 24h hours with 00 at midnight (not 24)', () => {
    expect(formatInZone('2026-11-03T00:00:00Z', 'UTC')).toBe('2026-11-03 00:00');
  });

  it('falls back to device zone for an invalid zone', () => {
    expect(formatInZone('2026-11-03T15:05:00Z', 'Not/AZone')).toBe('2026-11-03 10:05');
    expect(formatInZone('2026-11-03T15:05:00Z', '')).toBe('2026-11-03 10:05');
  });

  it('distinguishes the repeated hour on fall-back day in device zone', () => {
    expect(formatInZone('2026-11-01T05:30:00Z', 'America/New_York')).toBe('2026-11-01 01:30');
    expect(formatInZone('2026-11-01T06:30:00Z', 'America/New_York')).toBe('2026-11-01 01:30');
  });

  it('returns empty string for an invalid instant', () => {
    expect(formatInZone('not-a-date', 'UTC')).toBe('');
  });
});
