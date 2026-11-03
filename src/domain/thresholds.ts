import type {
  Measurement,
  MetricConfig,
  MetricDefinition,
  StatusKind,
  Thresholds,
  Unit,
} from './types';
import { convertValue } from './units';

/** Threshold keys in ascending order. Low pair ≤ each other, low < high, high pair ≤ each other. */
const ORDER = ['alertLow', 'targetLow', 'targetHigh', 'alertHigh'] as const;
const LABELS: Record<(typeof ORDER)[number], string> = {
  alertLow: 'Low alert',
  targetLow: 'Target low',
  targetHigh: 'Target high',
  alertHigh: 'High alert',
};

/**
 * Checks alertLow ≤ targetLow < targetHigh ≤ alertHigh for whichever values are present
 * (any low value must be strictly below any high value). Returns an error message or null.
 */
export function validateThresholds(t: Thresholds): string | null {
  for (const k of ORDER) {
    const v = t[k];
    if (v !== undefined && !Number.isFinite(v)) return `${LABELS[k]} must be a number.`;
  }
  for (let i = 0; i < ORDER.length; i++) {
    for (let j = i + 1; j < ORDER.length; j++) {
      const ki = ORDER[i] as (typeof ORDER)[number];
      const kj = ORDER[j] as (typeof ORDER)[number];
      const a = t[ki];
      const b = t[kj];
      if (a === undefined || b === undefined) continue;
      const strict = i < 2 && j >= 2;
      if (strict ? a >= b : a > b) {
        return `${LABELS[ki]} must be ${strict ? 'lower than' : 'no higher than'} ${LABELS[kj].toLowerCase()}.`;
      }
    }
  }
  return null;
}

const SEVERITY: Record<StatusKind, number> = {
  unconfigured: 0,
  in_range: 1,
  below_target: 2,
  above_target: 2,
  below_alert: 3,
  above_alert: 3,
};

function hasAny(t: Thresholds | undefined): t is Thresholds {
  return t !== undefined && ORDER.some((k) => t[k] !== undefined);
}

function classify(v: number, t: Thresholds): StatusKind {
  if (t.alertLow !== undefined && v < t.alertLow) return 'below_alert';
  if (t.alertHigh !== undefined && v > t.alertHigh) return 'above_alert';
  if (t.targetLow !== undefined && v < t.targetLow) return 'below_target';
  if (t.targetHigh !== undefined && v > t.targetHigh) return 'above_target';
  return 'in_range';
}

/**
 * Status of a measurement against clinician thresholds in `config` (stored in `config.thresholdUnit ?? config.unit`).
 * Evaluates every `def.thresholdFields` entry that has thresholds and a value; returns the most
 * severe result. With no configured thresholds at all → 'unconfigured'.
 */
export function evaluateStatus(
  def: MetricDefinition,
  config: MetricConfig,
  m: Measurement,
): StatusKind {
  let worst: StatusKind = 'unconfigured';
  for (const key of def.thresholdFields) {
    const t = config.thresholds[key];
    const raw = m.value[key];
    if (!hasAny(t) || raw === undefined) continue;
    const v = convertValue(raw, m.unit, config.thresholdUnit ?? config.unit);
    const kind = classify(v, t);
    if (SEVERITY[kind] > SEVERITY[worst]) worst = kind;
  }
  return worst;
}

const STATUS_LABELS: Record<StatusKind, string> = {
  unconfigured: 'No target range configured',
  in_range: 'In target range',
  below_target: 'Below target range',
  above_target: 'Above target range',
  below_alert: 'Below low alert',
  above_alert: 'Above high alert',
};

export function statusLabel(kind: StatusKind): string {
  return STATUS_LABELS[kind];
}

export function statusIsConcerning(kind: StatusKind): boolean {
  return SEVERITY[kind] >= 2;
}

export function convertThresholds(t: Thresholds, from: Unit, to: Unit): Thresholds {
  const out: Thresholds = {};
  for (const k of ORDER) {
    const v = t[k];
    if (v !== undefined) out[k] = convertValue(v, from, to);
  }
  return out;
}
