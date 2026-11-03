/**
 * CSV export of measurements (FR-E1..E3). RFC 4180 escaping, UTF-8 BOM, CRLF line endings,
 * and a formula-injection guard on free-text cells.
 */
import type { Measurement, MetricRegistry } from './types';

export const CSV_HEADERS = [
  'id',
  'metric',
  'field',
  'value',
  'unit',
  'entered_as',
  'taken_at_local',
  'time_zone',
  'taken_at_utc',
  'note',
  'source',
  'created_at',
  'updated_at',
] as const;

const BOM = '\uFEFF';
const EOL = '\r\n';

/** Quote a field when it contains `, " \r \n` or leading/trailing space; double inner quotes. */
export function escapeCsvField(v: string): string {
  if (/[",\r\n]/.test(v) || /^\s|\s$/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Prefix `'` to values a spreadsheet would treat as a formula. */
export function guardFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function localFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    };
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone });
    } catch {
      f = new Intl.DateTimeFormat('en-US', opts); // invalid zone → device zone
    }
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** "YYYY-MM-DD HH:mm" in the given IANA zone (device zone if the zone is invalid). */
function formatLocal(iso: string, timeZone: string): string {
  const parts: Record<string, string> = {};
  for (const p of localFormatter(timeZone).formatToParts(new Date(iso))) parts[p.type] = p.value;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}`;
}

function row(cells: readonly string[]): string {
  return cells.map(escapeCsvField).join(',') + EOL;
}

export function measurementsToCsv(ms: Measurement[], registry: MetricRegistry): string {
  const sorted = [...ms].sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
  let out = BOM + row(CSV_HEADERS);
  for (const m of sorted) {
    const def = registry.get(m.metricId);
    const fields = def
      ? def.fields.map((f) => ({ key: f.key, unit: f.unitLabel ?? m.unit }))
      : Object.keys(m.value).map((key) => ({ key, unit: m.unit as string }));
    const local = formatLocal(m.takenAt, m.timeZone);
    for (const f of fields) {
      const n = m.value[f.key];
      if (n === undefined) continue;
      out += row([
        m.id,
        def?.name ?? m.metricId,
        f.key,
        String(n),
        f.unit,
        guardFormula(m.raw[f.key] ?? ''),
        local,
        m.timeZone,
        m.takenAt,
        guardFormula(m.note ?? ''),
        m.source,
        m.createdAt,
        m.updatedAt,
      ]);
    }
  }
  return out;
}

function localDate(now: Date): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** `sugar-daddy-${scope}-YYYY-MM-DD.csv` using the device-local date. */
export function csvFilename(scope: string, now: Date): string {
  return `sugar-daddy-${scope}-${localDate(now)}.csv`;
}
