/**
 * Device-local calendar and formatting helpers. All calendar arithmetic goes through
 * local wall-clock fields (`new Date(y, m, d, ...)`), never fixed 24h millisecond steps,
 * so DST transitions (23h / 25h days) are handled by the platform.
 *
 * Formatters accept an optional BCP 47 locale; `undefined` means the device locale.
 */

export type RangeKind = 'day' | 'week' | 'month';

export interface DateRange {
  start: Date;
  /** Exclusive. */
  end: Date;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Adds `n` calendar days keeping the local wall-clock time (DST-safe). */
export function addLocalDays(d: Date, n: number): Date {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + n,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
}

/** Range containing `anchor`. Week starts Monday. `end` is exclusive (next local midnight). */
export function rangeFor(kind: RangeKind, anchor: Date): DateRange {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();
  switch (kind) {
    case 'day':
      return { start: new Date(y, m, d), end: new Date(y, m, d + 1) };
    case 'week': {
      const sinceMonday = (anchor.getDay() + 6) % 7;
      return { start: new Date(y, m, d - sinceMonday), end: new Date(y, m, d - sinceMonday + 7) };
    }
    case 'month':
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  }
}

/** Moves the anchor one range back (-1) or forward (1). Month shifts clamp the day of month. */
export function shiftAnchor(kind: RangeKind, anchor: Date, dir: -1 | 1): Date {
  if (kind === 'day') return addLocalDays(anchor, dir);
  if (kind === 'week') return addLocalDays(anchor, 7 * dir);
  const y = anchor.getFullYear();
  const m = anchor.getMonth() + dir;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(
    y,
    m,
    Math.min(anchor.getDate(), lastDay),
    anchor.getHours(),
    anchor.getMinutes(),
    anchor.getSeconds(),
    anchor.getMilliseconds(),
  );
}

export function formatDateLong(d: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function formatTime(d: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(d);
}

export function formatDateTime(d: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** Human label for a range. Week labels show the inclusive last day (Sunday). */
export function formatRangeLabel(kind: RangeKind, range: DateRange, locale?: string): string {
  switch (kind) {
    case 'day':
      return formatDateLong(range.start, locale);
    case 'week': {
      const lastDay = addLocalDays(range.end, -1);
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).formatRange(range.start, lastDay);
    }
    case 'month':
      return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(
        range.start,
      );
  }
}

/** Value for `<input type="datetime-local">`: "YYYY-MM-DDTHH:mm" in device-local time. */
export function toLocalInputValue(d: Date): string {
  return `${localDateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parses "YYYY-MM-DDTHH:mm[:ss]" as device-local time. Returns null for malformed strings or
 * impossible calendar dates. A wall-clock time that does not exist (spring-forward gap) is
 * normalised by `Date` (e.g. 02:30 → 03:30 EDT) rather than rejected.
 */
export function fromLocalInputValue(s: string): Date | null {
  const m = LOCAL_INPUT_RE.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, sec] = m.slice(1).map((p) => (p === undefined ? 0 : Number(p))) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || sec > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, sec);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function zoneFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/**
 * Formats an ISO instant as "YYYY-MM-DD HH:mm" in `timeZone`. An invalid or empty zone falls
 * back to the device zone. An unparseable instant yields ''.
 */
export function formatInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = zoneFormatter(timeZone || undefined);
  } catch {
    fmt = zoneFormatter(undefined);
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
