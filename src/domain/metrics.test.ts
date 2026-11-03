import { describe, expect, it } from 'vitest';
import {
  BLOOD_PRESSURE,
  BUILTIN_METRICS,
  contextLabel,
  GLUCOSE,
  KETONES,
  WEIGHT,
  createMetricRegistry,
  defaultMetricConfig,
  formatMeasurementValue,
  metricRegistry,
  primaryMetric,
  unitLabel,
} from './metrics';
import { buildMeasurement } from './measurement';
import { evaluateStatus } from './thresholds';
import type { MetricConfig, MetricDefinition } from './types';
import { validateFields } from './validation';

function field(def: MetricDefinition, key: string) {
  const f = def.fields.find((x) => x.key === key);
  if (!f) throw new Error(`no field ${key}`);
  return f;
}

describe('built-in metric definitions', () => {
  it('glucose: units, default, limits, labels, enabled by default', () => {
    expect(GLUCOSE.id).toBe('glucose');
    expect(GLUCOSE.logLabel).toBe('Log glucose');
    expect(GLUCOSE.units).toEqual(['mg/dL', 'mmol/L']);
    expect(GLUCOSE.defaultUnit).toBe('mg/dL');
    expect(GLUCOSE.primaryField).toBe('value');
    expect(GLUCOSE.thresholdFields).toEqual(['value']);
    expect(GLUCOSE.defaultEnabled).toBe(true);
    const f = field(GLUCOSE, 'value');
    expect(f.required).toBe(true);
    expect(f.limits('mg/dL')).toEqual({ min: 10, max: 1000, maxDecimals: 0 });
    expect(f.limits('mmol/L')).toEqual({ min: 0.5, max: 55, maxDecimals: 2 });
  });

  it('blood pressure: systolic/diastolic required, pulse optional bpm', () => {
    expect(BLOOD_PRESSURE.id).toBe('blood_pressure');
    expect(BLOOD_PRESSURE.logLabel).toBe('Log blood pressure');
    expect(BLOOD_PRESSURE.units).toEqual(['mmHg']);
    expect(BLOOD_PRESSURE.defaultUnit).toBe('mmHg');
    expect(BLOOD_PRESSURE.fields.map((f) => f.key)).toEqual(['systolic', 'diastolic', 'pulse']);
    expect(BLOOD_PRESSURE.primaryField).toBe('systolic');
    expect(BLOOD_PRESSURE.thresholdFields).toEqual(['systolic', 'diastolic']);
    expect(BLOOD_PRESSURE.defaultEnabled).toBe(false);
    expect(field(BLOOD_PRESSURE, 'systolic').required).toBe(true);
    expect(field(BLOOD_PRESSURE, 'systolic').limits('mmHg')).toEqual({
      min: 40,
      max: 300,
      maxDecimals: 0,
    });
    expect(field(BLOOD_PRESSURE, 'diastolic').required).toBe(true);
    expect(field(BLOOD_PRESSURE, 'diastolic').limits('mmHg')).toEqual({
      min: 20,
      max: 200,
      maxDecimals: 0,
    });
    const pulse = field(BLOOD_PRESSURE, 'pulse');
    expect(pulse.required).toBe(false);
    expect(pulse.unitLabel).toBe('bpm');
    expect(pulse.limits('mmHg')).toEqual({ min: 20, max: 250, maxDecimals: 0 });
  });

  it('weight: kg default, lb option', () => {
    expect(WEIGHT.id).toBe('weight');
    expect(WEIGHT.logLabel).toBe('Log weight');
    expect(WEIGHT.units).toEqual(['kg', 'lb']);
    expect(WEIGHT.defaultUnit).toBe('kg');
    expect(WEIGHT.defaultEnabled).toBe(false);
    const f = field(WEIGHT, 'value');
    expect(f.limits('kg')).toEqual({ min: 1, max: 500, maxDecimals: 2 });
    expect(f.limits('lb')).toEqual({ min: 2, max: 1100, maxDecimals: 2 });
  });

  it('ketones: mmol/L only', () => {
    expect(KETONES.id).toBe('ketones');
    expect(KETONES.logLabel).toBe('Log ketones');
    expect(KETONES.units).toEqual(['mmol/L']);
    expect(KETONES.defaultUnit).toBe('mmol/L');
    expect(KETONES.defaultEnabled).toBe(false);
    expect(field(KETONES, 'value').limits('mmol/L')).toEqual({ min: 0, max: 15, maxDecimals: 2 });
  });

  it('every primaryField and thresholdField refers to a real field', () => {
    for (const def of BUILTIN_METRICS) {
      const keys = def.fields.map((f) => f.key);
      expect(keys).toContain(def.primaryField);
      for (const t of def.thresholdFields) expect(keys).toContain(t);
      expect(def.units).toContain(def.defaultUnit);
    }
  });

  it('BUILTIN_METRICS lists the four metrics in order', () => {
    expect(BUILTIN_METRICS.map((d) => d.id)).toEqual([
      'glucose',
      'blood_pressure',
      'weight',
      'ketones',
    ]);
  });
});

describe('createMetricRegistry', () => {
  it('returns all definitions sorted by order', () => {
    const reg = createMetricRegistry([KETONES, GLUCOSE, WEIGHT]);
    expect(reg.all().map((d) => d.id)).toEqual(['glucose', 'weight', 'ketones']);
  });

  it('get returns undefined for unknown ids; require throws', () => {
    const reg = createMetricRegistry([GLUCOSE]);
    expect(reg.get('glucose')).toBe(GLUCOSE);
    expect(reg.get('nope')).toBeUndefined();
    expect(reg.require('glucose')).toBe(GLUCOSE);
    expect(() => reg.require('nope')).toThrow(/nope/);
  });

  it('rejects duplicate ids', () => {
    expect(() => createMetricRegistry([GLUCOSE, GLUCOSE])).toThrow(/glucose/);
  });

  it('metricRegistry holds the built-ins', () => {
    expect(metricRegistry.all()).toEqual(BUILTIN_METRICS);
  });
});

describe('defaultMetricConfig', () => {
  it('uses default enabled/unit, empty thresholds, given timestamps', () => {
    const now = '2026-11-03T12:00:00.000Z';
    expect(defaultMetricConfig(GLUCOSE, now)).toEqual({
      metricId: 'glucose',
      enabled: true,
      unit: 'mg/dL',
      thresholds: {},
      createdAt: now,
      updatedAt: now,
    });
    expect(defaultMetricConfig(WEIGHT, now).enabled).toBe(false);
    expect(defaultMetricConfig(WEIGHT, now).unit).toBe('kg');
  });
});

describe('formatMeasurementValue', () => {
  it('formats BP as systolic/diastolic', () => {
    expect(
      formatMeasurementValue(BLOOD_PRESSURE, {
        value: { systolic: 120, diastolic: 80 },
        unit: 'mmHg',
      }),
    ).toBe('120/80');
  });

  it('appends pulse with bpm when present', () => {
    expect(
      formatMeasurementValue(BLOOD_PRESSURE, {
        value: { systolic: 120, diastolic: 80, pulse: 72 },
        unit: 'mmHg',
      }),
    ).toBe('120/80 · 72 bpm');
  });

  it('formats glucose in its own unit by default', () => {
    expect(formatMeasurementValue(GLUCOSE, { value: { value: 112 }, unit: 'mg/dL' })).toBe('112');
    expect(formatMeasurementValue(GLUCOSE, { value: { value: 6.25 }, unit: 'mmol/L' })).toBe('6.3');
  });

  it('converts to the display unit', () => {
    expect(
      formatMeasurementValue(GLUCOSE, { value: { value: 100 }, unit: 'mg/dL' }, 'mmol/L'),
    ).toBe('5.6');
    expect(formatMeasurementValue(WEIGHT, { value: { value: 70 }, unit: 'kg' }, 'lb')).toBe(
      '154.3',
    );
  });
});

describe('unitLabel', () => {
  it('returns the unit text', () => {
    expect(unitLabel(GLUCOSE, 'mg/dL')).toBe('mg/dL');
    expect(unitLabel(BLOOD_PRESSURE, 'mmHg')).toBe('mmHg');
    expect(unitLabel(WEIGHT, 'lb')).toBe('lb');
  });
});

/**
 * TEST-ONLY FIXTURE. Not a real metric and never shipped: it exists solely to prove that a new
 * metric can be added as data, with zero changes to validation, measurement or threshold code.
 * (`Unit` is a closed union, so the fixture borrows 'mmHg' as its metric unit and carries its
 * real unit on the field via `unitLabel`.)
 */
const TEST_FIXTURE_TEMPERATURE: MetricDefinition = {
  id: 'test_fixture_temperature',
  name: 'TEST FIXTURE',
  shortName: 'TEST FIXTURE',
  logLabel: 'Log TEST FIXTURE',
  units: ['mmHg'],
  defaultUnit: 'mmHg',
  fields: [
    {
      key: 'celsius',
      label: 'Temperature',
      required: true,
      unitLabel: '°C',
      limits: () => ({ min: 30, max: 45, maxDecimals: 1 }),
    },
  ],
  primaryField: 'celsius',
  thresholdFields: ['celsius'],
  defaultEnabled: false,
  order: 99,
};

describe('extensibility: TEST-ONLY fixture metric', () => {
  const registry = createMetricRegistry([...BUILTIN_METRICS, TEST_FIXTURE_TEMPERATURE]);
  const def = registry.require('test_fixture_temperature');
  const now = new Date('2026-11-03T15:00:00.000Z');

  it('registers alongside the built-ins in order', () => {
    expect(registry.all().map((d) => d.id)).toEqual([
      'glucose',
      'blood_pressure',
      'weight',
      'ketones',
      'test_fixture_temperature',
    ]);
  });

  it('validates using its own field definitions', () => {
    expect(validateFields(def, { celsius: '37.2' }, 'mmHg')).toEqual({
      ok: true,
      value: { celsius: 37.2 },
    });
    expect(validateFields(def, { celsius: '50' }, 'mmHg')).toEqual({
      ok: false,
      error: { celsius: 'Enter a number between 30 and 45 °C.' },
    });
    expect(validateFields(def, { celsius: '37.25' }, 'mmHg')).toEqual({
      ok: false,
      error: { celsius: 'Use at most 1 decimal places.' },
    });
  });

  it('builds a measurement', () => {
    const r = buildMeasurement(
      def,
      {
        metricId: 'test_fixture_temperature',
        raw: { celsius: '38,4' },
        unit: 'mmHg',
        takenAt: '2026-11-03T14:59:00.000Z',
        timeZone: 'America/New_York',
      },
      now,
      () => 'fixture-1',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.value).toEqual({ celsius: 38.4 });
    expect(r.value.raw).toEqual({ celsius: '38,4' });
    expect(formatMeasurementValue(def, r.value)).toBe('38.4');

    const config: MetricConfig = {
      ...defaultMetricConfig(def, now.toISOString()),
      thresholds: { celsius: { targetLow: 36, targetHigh: 37.5, alertHigh: 39 } },
    };
    expect(evaluateStatus(def, config, r.value)).toBe('above_target');
    expect(evaluateStatus(def, defaultMetricConfig(def, now.toISOString()), r.value)).toBe(
      'unconfigured',
    );
  });
});

describe('primaryMetric', () => {
  it('returns the definition flagged primary (glucose for the built-ins)', () => {
    expect(primaryMetric(metricRegistry).id).toBe('glucose');
  });
  it('falls back to the first metric by order when none is flagged', () => {
    const reg = createMetricRegistry([
      { ...KETONES, primary: false },
      { ...WEIGHT, primary: false },
    ]);
    expect(primaryMetric(reg).id).toBe(WEIGHT.order < KETONES.order ? WEIGHT.id : KETONES.id);
  });
});

describe('reading contexts', () => {
  it('glucose offers the five contexts in order', () => {
    expect(GLUCOSE.contexts).toEqual([
      { key: 'before_meal', label: 'Before meal' },
      { key: 'after_meal', label: 'After meal' },
      { key: 'fasting', label: 'Fasting' },
      { key: 'bedtime', label: 'Bedtime' },
      { key: 'other', label: 'Other' },
    ]);
  });

  it('other built-ins have no contexts', () => {
    expect(BLOOD_PRESSURE.contexts).toBeUndefined();
    expect(WEIGHT.contexts).toBeUndefined();
    expect(KETONES.contexts).toBeUndefined();
  });

  it('contextLabel returns the label for a known key', () => {
    expect(contextLabel(GLUCOSE, 'before_meal')).toBe('Before meal');
    expect(contextLabel(GLUCOSE, 'bedtime')).toBe('Bedtime');
  });

  it('contextLabel is undefined for no key, an unknown key, or a metric without contexts', () => {
    expect(contextLabel(GLUCOSE)).toBeUndefined();
    expect(contextLabel(GLUCOSE, undefined)).toBeUndefined();
    expect(contextLabel(GLUCOSE, 'lunch')).toBeUndefined();
    expect(contextLabel(BLOOD_PRESSURE, 'before_meal')).toBeUndefined();
  });
});
