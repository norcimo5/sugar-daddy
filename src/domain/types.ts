/**
 * Shared domain contract for Sugar Daddy. Pure types plus a few constants.
 * Every other module depends on this file; keep it stable.
 */

/** Built-ins: 'glucose' | 'blood_pressure' | 'weight' | 'ketones'. Extensible. */
export type MetricId = string;

/** Every unit the app understands. Add a new unit here (and in units.ts decimals). */
export const UNITS = ['mg/dL', 'mmol/L', 'mmHg', 'kg', 'lb'] as const;
export type Unit = (typeof UNITS)[number];

export interface ContextOption {
  key: string;
  label: string;
}

export interface FieldLimits {
  min: number;
  max: number;
  maxDecimals: number;
}

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  /** Fixed unit label overriding the metric unit for this field (e.g. 'bpm' for pulse). */
  unitLabel?: string;
  limits(unit: Unit): FieldLimits;
}

export interface MetricDefinition {
  id: MetricId;
  name: string;
  shortName: string;
  /** Button text, e.g. "Log glucose". */
  logLabel: string;
  units: readonly Unit[];
  defaultUnit: Unit;
  fields: readonly FieldDef[];
  /** Field used for charts. */
  primaryField: string;
  /** Fields that may carry clinician thresholds. */
  thresholdFields: readonly string[];
  defaultEnabled: boolean;
  order: number;
  /** The headline metric shown first on Today (exactly one: glucose). */
  primary?: boolean;
  /** Optional reading context choices (e.g. Before meal). */
  contexts?: readonly ContextOption[];
}

export interface MetricRegistry {
  all(): readonly MetricDefinition[];
  get(id: MetricId): MetricDefinition | undefined;
  require(id: MetricId): MetricDefinition;
}

export interface Thresholds {
  targetLow?: number;
  targetHigh?: number;
  alertLow?: number;
  alertHigh?: number;
}

export interface MetricConfig {
  metricId: MetricId;
  enabled: boolean;
  /** Display/entry unit. Thresholds are stored in this unit. */
  unit: Unit;
  /** Keyed by field key. */
  thresholds: Record<string, Thresholds>;
  /**
   * Unit the clinician thresholds were entered in. Thresholds are never converted when the
   * display unit changes; readings are converted to this unit for evaluation instead.
   * Absent (older data) → thresholds are in `unit`.
   */
  thresholdUnit?: Unit;
  createdAt: string;
  updatedAt: string;
}

export interface Measurement {
  id: string;
  metricId: MetricId;
  /** Parsed numbers keyed by field key. Never rounded or clamped. */
  value: Record<string, number>;
  /** Exactly what the user typed, keyed by field key. */
  raw: Record<string, string>;
  /** Unit at time of entry. */
  unit: Unit;
  /** ISO 8601 UTC instant. */
  takenAt: string;
  /** IANA zone of the device at entry time. */
  timeZone: string;
  note?: string;
  /** Key from the metric definition's `contexts`. */
  context?: string;
  source: 'manual' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface MeasurementInput {
  metricId: MetricId;
  raw: Record<string, string>;
  unit: Unit;
  takenAt: string;
  timeZone: string;
  note?: string;
  context?: string;
}

export interface Reminder {
  id: string;
  /** Local wall-clock time "HH:MM" (24h). */
  time: string;
  metricId: MetricId;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Dismissal {
  /** `${reminderId}@${YYYY-MM-DD}` */
  id: string;
  reminderId: string;
  date: string;
  createdAt: string;
}

export type Tone = 'playful' | 'neutral';
export type TextSize = 'standard' | 'large' | 'xlarge';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  tone: Tone;
  textSize: TextSize;
  theme: ThemePref;
  graceMinutes: number;
  notificationsEnabled: boolean;
  lastBackupAt?: string;
  firstRunDone: boolean;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  tone: 'playful',
  textSize: 'standard',
  theme: 'system',
  graceMinutes: 60,
  notificationsEnabled: false,
  firstRunDone: false,
}) as Settings;

export const GRACE_MIN = 15;
export const GRACE_MAX = 240;

export type StatusKind =
  'unconfigured' | 'in_range' | 'below_target' | 'above_target' | 'below_alert' | 'above_alert';

export interface AppSnapshot {
  settings: Settings;
  metricConfigs: MetricConfig[];
  reminders: Reminder[];
  dismissals: Dismissal[];
  measurements: Measurement[];
}

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
