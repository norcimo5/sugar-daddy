/**
 * Plain-text share content (requirements §7 F5). Pure. Notes are never included; the status
 * line appears only when a target range is configured. Times are device-local.
 */
import { contextLabel, formatMeasurementValue, unitLabel } from './metrics';
import { statusLabel } from './thresholds';
import type { Measurement, MetricDefinition, StatusKind, Unit } from './types';

const FOOTER = 'Recorded with Sugar Daddy. Not medical advice.';

/** Intl may emit narrow/no-break spaces (e.g. before "PM"); shared text uses plain spaces. */
function plainSpaces(s: string): string {
  return s.replace(/[\u202f\u00a0]/g, ' ');
}

function formatWith(iso: string, locale: string | undefined, opts: Intl.DateTimeFormatOptions) {
  return plainSpaces(new Intl.DateTimeFormat(locale, opts).format(new Date(iso)));
}

/**
 * "120/80 mmHg · 72 bpm": metric-unit fields (converted to `displayUnit`) carry the unit once;
 * fixed-unit fields (e.g. pulse) follow with their own label.
 */
function valueText(def: MetricDefinition, m: Measurement, displayUnit: Unit): string {
  const metricUnitValues: Record<string, number> = {};
  const fixed: string[] = [];
  for (const f of def.fields) {
    const v = m.value[f.key];
    if (v === undefined) continue;
    if (f.unitLabel === undefined) {
      metricUnitValues[f.key] = v;
    } else {
      const text = formatMeasurementValue(def, { value: { [f.key]: v }, unit: m.unit });
      fixed.push(f.required ? `${text} ${f.unitLabel}` : text);
    }
  }
  const main = formatMeasurementValue(def, { value: metricUnitValues, unit: m.unit }, displayUnit);
  const withUnit = main === '' ? [] : [`${main} ${unitLabel(def, displayUnit)}`];
  return [...withUnit, ...fixed].join(' · ');
}

function contextText(def: MetricDefinition, m: Measurement): string | undefined {
  return contextLabel(def, m.context) ?? m.context;
}

export function readingShareText(
  def: MetricDefinition,
  m: Measurement,
  displayUnit: Unit,
  status: StatusKind,
  locale?: string,
): string {
  const when = formatWith(m.takenAt, locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const head = [valueText(def, m, displayUnit), contextText(def, m), when]
    .filter((s): s is string => s !== undefined && s !== '')
    .join(' · ');
  const lines = [`${def.name}: ${head}`];
  if (status !== 'unconfigured') lines.push(statusLabel(status));
  return [...lines, '', FOOTER].join('\n');
}

export function summaryShareText(
  def: MetricDefinition,
  ms: Measurement[],
  rangeLabel: string,
  displayUnit: Unit,
  locale?: string,
): string {
  if (ms.length === 0) {
    return `No ${def.name.toLowerCase()} readings in ${rangeLabel}.\n\n${FOOTER}`;
  }
  const sorted = [...ms].sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
  const lines = sorted.map((m) => {
    const when = formatWith(m.takenAt, locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const ctx = contextText(def, m);
    const value = valueText(def, m, displayUnit);
    return `${when} — ${ctx ? `${value} · ${ctx}` : value}`;
  });
  return [`${def.name} readings — ${rangeLabel} (${ms.length})`, ...lines, '', FOOTER].join('\n');
}
