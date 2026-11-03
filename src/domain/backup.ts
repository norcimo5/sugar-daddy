/**
 * JSON backup and restore (FR-E4, FR-E5). Pure: builds backup files, strictly validates
 * untrusted backup text, and plans a merge/replace restore without touching storage.
 */
import {
  GRACE_MAX,
  GRACE_MIN,
  UNITS,
  type AppSnapshot,
  type Dismissal,
  type Measurement,
  type MetricConfig,
  type MetricDefinition,
  type MetricRegistry,
  type Reminder,
  type Result,
  type Settings,
  type TextSize,
  type Thresholds,
  type Tone,
  type Unit,
} from './types';

export const BACKUP_FORMAT = 'sugar-daddy-backup';
export const BACKUP_VERSION = 1;
const APP_NAME = 'Sugar Daddy';
/** Maximum accepted backup text length (characters), roughly 20 MB. */
const MAX_BACKUP_CHARS = 20 * 1024 * 1024;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: { name: string; version: string };
  data: AppSnapshot;
}

export type RestoreMode = 'merge' | 'replace';

export interface RestorePlan {
  mode: RestoreMode;
  snapshot: AppSnapshot;
  counts: {
    measurementsNew: number;
    measurementsDuplicate: number;
    remindersNew: number;
    remindersDuplicate: number;
    /** Measurements in the backup. */
    total: number;
  };
}

export function buildBackup(s: AppSnapshot, now: Date, appVersion: string): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    app: { name: APP_NAME, version: appVersion },
    data: structuredClone(s),
  };
}

function localDate(now: Date): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** `sugar-daddy-backup-YYYY-MM-DD.json` using the device-local date. */
export function backupFilename(now: Date): string {
  return `sugar-daddy-backup-${localDate(now)}.json`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

class BackupError extends Error {}

function fail(message: string): never {
  throw new BackupError(message);
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isCalendarDate(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,9})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isIsoInstant(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = ISO_INSTANT.exec(v);
  if (!m) return false;
  if (!isCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]))) return false;
  return Number.isFinite(Date.parse(v));
}

function isLocalDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return !!m && isCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

const TONES: readonly Tone[] = ['playful', 'neutral'];
const TEXT_SIZES: readonly TextSize[] = ['standard', 'large', 'xlarge'];
const THRESHOLD_KEYS: readonly (keyof Thresholds)[] = [
  'targetLow',
  'targetHigh',
  'alertLow',
  'alertHigh',
];

function isUnitFor(v: unknown, def: MetricDefinition): v is Unit {
  return (
    typeof v === 'string' &&
    (UNITS as readonly string[]).includes(v) &&
    def.units.includes(v as Unit)
  );
}

function requireArray(data: Obj, key: string, label: string): unknown[] {
  const v = data[key];
  if (!Array.isArray(v)) fail(`The backup's ${label} list is missing or damaged.`);
  return v;
}

function validateSettings(v: unknown): Settings {
  if (!isObj(v)) fail('Settings are missing or damaged.');
  if (!TONES.includes(v.tone as Tone)) fail('Settings have an invalid tone.');
  if (!TEXT_SIZES.includes(v.textSize as TextSize)) fail('Settings have an invalid text size.');
  if (!isFiniteNumber(v.graceMinutes) || v.graceMinutes < GRACE_MIN || v.graceMinutes > GRACE_MAX) {
    fail(`Settings have an invalid grace period (must be ${GRACE_MIN}–${GRACE_MAX} minutes).`);
  }
  if (typeof v.notificationsEnabled !== 'boolean')
    fail('Settings have an invalid notifications value.');
  if (typeof v.firstRunDone !== 'boolean') fail('Settings have an invalid first-run value.');
  if (v.lastBackupAt !== undefined && !isIsoInstant(v.lastBackupAt)) {
    fail('Settings have an invalid last backup date.');
  }
  const s: Settings = {
    tone: v.tone as Tone,
    textSize: v.textSize as TextSize,
    graceMinutes: v.graceMinutes,
    notificationsEnabled: v.notificationsEnabled,
    firstRunDone: v.firstRunDone,
  };
  if (v.lastBackupAt !== undefined) s.lastBackupAt = v.lastBackupAt as string;
  return s;
}

function validateMeasurement(v: unknown, n: number, registry: MetricRegistry): Measurement {
  const at = `Measurement ${n}`;
  if (!isObj(v)) fail(`${at} is not a valid record.`);
  if (!isNonEmptyString(v.id)) fail(`${at} is missing its ID.`);
  if (typeof v.metricId !== 'string') fail(`${at} is missing its metric.`);
  const def = registry.get(v.metricId);
  if (!def) fail(`${at} uses an unknown metric ("${v.metricId}").`);
  if (!isUnitFor(v.unit, def)) fail(`${at} has an invalid unit.`);
  if (!isIsoInstant(v.takenAt) || !isIsoInstant(v.createdAt) || !isIsoInstant(v.updatedAt)) {
    fail(`${at} has an invalid date.`);
  }
  if (!isNonEmptyString(v.timeZone)) fail(`${at} has an invalid time zone.`);
  if (v.source !== 'manual' && v.source !== 'import') fail(`${at} has an invalid source.`);
  if (v.note !== undefined && typeof v.note !== 'string') fail(`${at} has an invalid note.`);

  const fieldKeys = new Set(def.fields.map((f) => f.key));
  if (!isObj(v.value)) fail(`${at} has missing or damaged values.`);
  if (!isObj(v.raw)) fail(`${at} has missing or damaged entered text.`);
  const value: Record<string, number> = {};
  for (const [k, x] of Object.entries(v.value)) {
    if (!fieldKeys.has(k)) fail(`${at} has a value "${k}" that ${def.name} does not have.`);
    if (!isFiniteNumber(x)) fail(`${at} has a value "${k}" that is not a valid number.`);
    value[k] = x;
  }
  const raw: Record<string, string> = {};
  for (const [k, x] of Object.entries(v.raw)) {
    if (!fieldKeys.has(k)) fail(`${at} has entered text "${k}" that ${def.name} does not have.`);
    if (typeof x !== 'string') fail(`${at} has entered text "${k}" that is not text.`);
    raw[k] = x;
  }
  for (const f of def.fields) {
    if (f.required && value[f.key] === undefined)
      fail(`${at} is missing the required value "${f.key}".`);
  }

  const m: Measurement = {
    id: v.id,
    metricId: v.metricId,
    value,
    raw,
    unit: v.unit,
    takenAt: v.takenAt as string,
    timeZone: v.timeZone,
    source: v.source,
    createdAt: v.createdAt as string,
    updatedAt: v.updatedAt as string,
  };
  if (v.note !== undefined) m.note = v.note;
  return m;
}

function validateReminder(v: unknown, n: number, registry: MetricRegistry): Reminder {
  const at = `Reminder ${n}`;
  if (!isObj(v)) fail(`${at} is not a valid record.`);
  if (!isNonEmptyString(v.id)) fail(`${at} is missing its ID.`);
  if (typeof v.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) {
    fail(`${at} has an invalid time (expected HH:MM).`);
  }
  if (typeof v.metricId !== 'string' || !registry.get(v.metricId)) {
    fail(`${at} uses an unknown metric ("${String(v.metricId)}").`);
  }
  if (typeof v.enabled !== 'boolean') fail(`${at} has an invalid on/off value.`);
  if (!isIsoInstant(v.createdAt) || !isIsoInstant(v.updatedAt)) fail(`${at} has an invalid date.`);
  return {
    id: v.id,
    time: v.time,
    metricId: v.metricId,
    enabled: v.enabled,
    createdAt: v.createdAt as string,
    updatedAt: v.updatedAt as string,
  };
}

function validateDismissal(v: unknown, n: number): Dismissal {
  const at = `Dismissal ${n}`;
  if (!isObj(v)) fail(`${at} is not a valid record.`);
  if (!isNonEmptyString(v.reminderId)) fail(`${at} is missing its reminder.`);
  if (!isLocalDate(v.date)) fail(`${at} has an invalid date.`);
  if (!isIsoInstant(v.createdAt)) fail(`${at} has an invalid date.`);
  if (v.id !== `${v.reminderId}@${v.date}`) fail(`${at} has an invalid ID.`);
  return { id: v.id, reminderId: v.reminderId, date: v.date, createdAt: v.createdAt };
}

function validateMetricConfig(v: unknown, n: number, registry: MetricRegistry): MetricConfig {
  const at = `Metric setting ${n}`;
  if (!isObj(v)) fail(`${at} is not a valid record.`);
  if (typeof v.metricId !== 'string') fail(`${at} is missing its metric.`);
  const def = registry.get(v.metricId);
  if (!def) fail(`${at} uses an unknown metric ("${v.metricId}").`);
  if (typeof v.enabled !== 'boolean') fail(`${at} has an invalid on/off value.`);
  if (!isUnitFor(v.unit, def)) fail(`${at} has an invalid unit.`);
  if (!isIsoInstant(v.createdAt) || !isIsoInstant(v.updatedAt)) fail(`${at} has an invalid date.`);
  if (!isObj(v.thresholds)) fail(`${at} has missing or damaged target ranges.`);
  const fieldKeys = new Set(def.fields.map((f) => f.key));
  const thresholds: Record<string, Thresholds> = {};
  for (const [k, t] of Object.entries(v.thresholds)) {
    if (!fieldKeys.has(k))
      fail(`${at} has a target range for "${k}", which ${def.name} does not have.`);
    if (!isObj(t)) fail(`${at} has a damaged target range for "${k}".`);
    const out: Thresholds = {};
    for (const [tk, tv] of Object.entries(t)) {
      if (!(THRESHOLD_KEYS as readonly string[]).includes(tk)) {
        fail(`${at} has an unknown target range entry "${tk}".`);
      }
      if (tv === undefined) continue;
      if (!isFiniteNumber(tv))
        fail(`${at} has a target range for "${k}" that is not a valid number.`);
      out[tk as keyof Thresholds] = tv;
    }
    thresholds[k] = out;
  }
  return {
    metricId: v.metricId,
    enabled: v.enabled,
    unit: v.unit,
    thresholds,
    createdAt: v.createdAt as string,
    updatedAt: v.updatedAt as string,
  };
}

function validateList<T>(
  items: unknown[],
  label: string,
  validate: (v: unknown, n: number) => T,
  keyOf: (t: T) => string,
  dupMessage: string,
): T[] {
  const seen = new Set<string>();
  return items.map((item, i) => {
    const t = validate(item, i + 1);
    const key = keyOf(t);
    if (seen.has(key)) fail(`${label} ${i + 1} ${dupMessage}`);
    seen.add(key);
    return t;
  });
}

function validateBackup(parsed: unknown, registry: MetricRegistry): BackupFile {
  if (!isObj(parsed) || parsed.format !== BACKUP_FORMAT)
    fail('This file is not a Sugar Daddy backup.');
  const version = parsed.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    fail('This backup has an unrecognised version number.');
  }
  if (version > BACKUP_VERSION) {
    fail('This backup was made by a newer version of Sugar Daddy. Update the app, then try again.');
  }
  if (!isIsoInstant(parsed.exportedAt)) fail('This backup has an invalid export date.');
  const app = parsed.app;
  if (!isObj(app) || typeof app.name !== 'string' || typeof app.version !== 'string') {
    fail('This backup is missing its app information.');
  }
  const data = parsed.data;
  if (!isObj(data)) fail('This backup contains no data.');

  const settings = validateSettings(data.settings);
  const metricConfigs = validateList(
    requireArray(data, 'metricConfigs', 'metric settings'),
    'Metric setting',
    (v, n) => validateMetricConfig(v, n, registry),
    (c) => c.metricId,
    'is for a metric that appears more than once.',
  );
  const reminders = validateList(
    requireArray(data, 'reminders', 'reminders'),
    'Reminder',
    (v, n) => validateReminder(v, n, registry),
    (r) => r.id,
    'has the same ID as an earlier reminder.',
  );
  const dismissals = validateList(
    requireArray(data, 'dismissals', 'dismissals'),
    'Dismissal',
    validateDismissal,
    (d) => d.id,
    'has the same ID as an earlier dismissal.',
  );
  const measurements = validateList(
    requireArray(data, 'measurements', 'measurements'),
    'Measurement',
    (v, n) => validateMeasurement(v, n, registry),
    (m) => m.id,
    'has the same ID as an earlier measurement.',
  );

  return {
    format: BACKUP_FORMAT,
    version,
    exportedAt: parsed.exportedAt as string,
    app: { name: app.name, version: app.version },
    data: { settings, metricConfigs, reminders, dismissals, measurements },
  };
}

/** Strictly parse untrusted backup text. Never throws; errors are plain-language. */
export function parseBackup(text: string, registry: MetricRegistry): Result<BackupFile> {
  if (text.length > MAX_BACKUP_CHARS) {
    return { ok: false, error: 'This backup file is too large (over 20 MB).' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file could not be read. It is not a valid backup file.' };
  }
  try {
    return { ok: true, value: validateBackup(parsed, registry) };
  } catch (e) {
    if (e instanceof BackupError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Restore planning
// ---------------------------------------------------------------------------

function unionBy<T>(existing: readonly T[], incoming: readonly T[], key: (t: T) => string) {
  const have = new Set(existing.map(key));
  const added = incoming.filter((t) => !have.has(key(t)));
  return {
    merged: [...existing, ...added],
    added: added.length,
    duplicate: incoming.length - added.length,
  };
}

export function planRestore(
  existing: AppSnapshot,
  backup: BackupFile,
  mode: RestoreMode,
): RestorePlan {
  const ex = structuredClone(existing);
  const bk = structuredClone(backup.data);
  const ms = unionBy(ex.measurements, bk.measurements, (m) => m.id);
  const rs = unionBy(ex.reminders, bk.reminders, (r) => r.id);
  const counts = {
    measurementsNew: ms.added,
    measurementsDuplicate: ms.duplicate,
    remindersNew: rs.added,
    remindersDuplicate: rs.duplicate,
    total: bk.measurements.length,
  };
  if (mode === 'replace') return { mode, snapshot: bk, counts };
  return {
    mode,
    counts,
    snapshot: {
      settings: ex.settings,
      metricConfigs: unionBy(ex.metricConfigs, bk.metricConfigs, (c) => c.metricId).merged,
      reminders: rs.merged,
      dismissals: unionBy(ex.dismissals, bk.dismissals, (d) => d.id).merged,
      measurements: ms.merged,
    },
  };
}
