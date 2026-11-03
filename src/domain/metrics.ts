/**
 * Metric definitions are plain data. To add a metric, build a `MetricDefinition` and include it
 * in the array passed to `createMetricRegistry`; validation, measurement building, thresholds
 * and formatting all work from the definition without code changes (see metrics.test.ts).
 */
import type {
  FieldDef,
  FieldLimits,
  Measurement,
  MetricConfig,
  MetricDefinition,
  MetricId,
  MetricRegistry,
  Unit,
} from './types';
import { convertValue, displayDecimals, formatNumber } from './units';

/** Builds a `limits(unit)` function from a per-unit table; throws for units not listed. */
export function limitsByUnit(
  table: Partial<Record<Unit, FieldLimits>>,
): (unit: Unit) => FieldLimits {
  return (unit) => {
    const l = table[unit];
    if (!l) throw new Error(`No limits for unit ${unit}`);
    return l;
  };
}

/** Same limits whatever the unit (e.g. fields with a fixed `unitLabel`). */
function fixedLimits(l: FieldLimits): (unit: Unit) => FieldLimits {
  return () => l;
}

const valueField = (limits: FieldDef['limits']): FieldDef => ({
  key: 'value',
  label: 'Value',
  required: true,
  limits,
});

export const GLUCOSE: MetricDefinition = {
  id: 'glucose',
  primary: true,
  name: 'Glucose',
  shortName: 'Glucose',
  logLabel: 'Log glucose',
  units: ['mg/dL', 'mmol/L'],
  defaultUnit: 'mg/dL',
  fields: [
    valueField(
      limitsByUnit({
        'mg/dL': { min: 10, max: 1000, maxDecimals: 0 },
        'mmol/L': { min: 0.5, max: 55, maxDecimals: 2 },
      }),
    ),
  ],
  primaryField: 'value',
  thresholdFields: ['value'],
  defaultEnabled: true,
  order: 10,
};

export const BLOOD_PRESSURE: MetricDefinition = {
  id: 'blood_pressure',
  name: 'Blood pressure',
  shortName: 'BP',
  logLabel: 'Log blood pressure',
  units: ['mmHg'],
  defaultUnit: 'mmHg',
  fields: [
    {
      key: 'systolic',
      label: 'Systolic',
      required: true,
      limits: limitsByUnit({ mmHg: { min: 40, max: 300, maxDecimals: 0 } }),
    },
    {
      key: 'diastolic',
      label: 'Diastolic',
      required: true,
      limits: limitsByUnit({ mmHg: { min: 20, max: 200, maxDecimals: 0 } }),
    },
    {
      key: 'pulse',
      label: 'Pulse',
      required: false,
      unitLabel: 'bpm',
      limits: fixedLimits({ min: 20, max: 250, maxDecimals: 0 }),
    },
  ],
  primaryField: 'systolic',
  thresholdFields: ['systolic', 'diastolic'],
  defaultEnabled: false,
  order: 20,
};

export const WEIGHT: MetricDefinition = {
  id: 'weight',
  name: 'Weight',
  shortName: 'Weight',
  logLabel: 'Log weight',
  units: ['kg', 'lb'],
  defaultUnit: 'kg',
  fields: [
    valueField(
      limitsByUnit({
        kg: { min: 1, max: 500, maxDecimals: 2 },
        lb: { min: 2, max: 1100, maxDecimals: 2 },
      }),
    ),
  ],
  primaryField: 'value',
  thresholdFields: ['value'],
  defaultEnabled: false,
  order: 30,
};

export const KETONES: MetricDefinition = {
  id: 'ketones',
  name: 'Ketones',
  shortName: 'Ketones',
  logLabel: 'Log ketones',
  units: ['mmol/L'],
  defaultUnit: 'mmol/L',
  fields: [valueField(limitsByUnit({ 'mmol/L': { min: 0, max: 15, maxDecimals: 2 } }))],
  primaryField: 'value',
  thresholdFields: ['value'],
  defaultEnabled: false,
  order: 40,
};

export const BUILTIN_METRICS: readonly MetricDefinition[] = [
  GLUCOSE,
  BLOOD_PRESSURE,
  WEIGHT,
  KETONES,
];

export function createMetricRegistry(defs: readonly MetricDefinition[]): MetricRegistry {
  const byId = new Map<MetricId, MetricDefinition>();
  for (const d of defs) {
    if (byId.has(d.id)) throw new Error(`Duplicate metric id: ${d.id}`);
    byId.set(d.id, d);
  }
  const sorted = [...defs].sort((a, b) => a.order - b.order);
  return {
    all: () => sorted,
    get: (id) => byId.get(id),
    require: (id) => {
      const d = byId.get(id);
      if (!d) throw new Error(`Unknown metric: ${id}`);
      return d;
    },
  };
}

export const metricRegistry: MetricRegistry = createMetricRegistry(BUILTIN_METRICS);

/** The headline metric (shown first on Today, always enabled). */
export function primaryMetric(registry: MetricRegistry): MetricDefinition {
  const all = registry.all();
  const found = all.find((d) => d.primary) ?? all[0];
  if (!found) throw new Error('No metrics are registered.');
  return found;
}

export function defaultMetricConfig(def: MetricDefinition, nowIso: string): MetricConfig {
  return {
    metricId: def.id,
    enabled: def.defaultEnabled,
    unit: def.defaultUnit,
    thresholds: {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Display text for a measurement value (no unit for the metric unit; fixed-unit fields carry
 * their own label). Required fields are joined with "/" (e.g. BP "120/80"); optional fields that
 * are present are appended as " · 72 bpm". Metric-unit fields are converted to `displayUnit`.
 */
export function formatMeasurementValue(
  def: MetricDefinition,
  m: Pick<Measurement, 'value' | 'unit'>,
  displayUnit?: Unit,
): string {
  const target = displayUnit ?? m.unit;
  const fmt = (f: FieldDef, v: number): string =>
    f.unitLabel !== undefined
      ? formatNumber(v, f.limits(m.unit).maxDecimals)
      : formatNumber(convertValue(v, m.unit, target), displayDecimals(target));

  const required: string[] = [];
  const extras: string[] = [];
  for (const f of def.fields) {
    const v = m.value[f.key];
    if (v === undefined) continue;
    if (f.required) required.push(fmt(f, v));
    else extras.push(f.unitLabel ? `${fmt(f, v)} ${f.unitLabel}` : fmt(f, v));
  }
  return [required.join('/'), ...extras].filter((s) => s !== '').join(' · ');
}

export function unitLabel(_def: MetricDefinition, unit: Unit): string {
  return unit;
}
