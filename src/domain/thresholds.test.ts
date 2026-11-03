import { describe, expect, it } from 'vitest';
import { BLOOD_PRESSURE, GLUCOSE, defaultMetricConfig } from './metrics';
import {
  convertThresholds,
  evaluateStatus,
  statusIsConcerning,
  statusLabel,
  validateThresholds,
} from './thresholds';
import type { Measurement, MetricConfig, StatusKind, Thresholds, Unit } from './types';

const NOW = '2026-11-03T15:00:00.000Z';

function glucoseConfig(t: Thresholds, unit: Unit = 'mg/dL'): MetricConfig {
  return { ...defaultMetricConfig(GLUCOSE, NOW), unit, thresholds: { value: t } };
}

function reading(value: Record<string, number>, unit: Unit, metricId = 'glucose'): Measurement {
  return {
    id: 'm',
    metricId,
    value,
    raw: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)])),
    unit,
    takenAt: NOW,
    timeZone: 'America/New_York',
    source: 'manual',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const g = (v: number, unit: Unit = 'mg/dL') => reading({ value: v }, unit);
const FULL: Thresholds = { alertLow: 54, targetLow: 70, targetHigh: 180, alertHigh: 250 };

describe('validateThresholds', () => {
  it('accepts empty and fully ordered thresholds', () => {
    expect(validateThresholds({})).toBeNull();
    expect(validateThresholds(FULL)).toBeNull();
    expect(validateThresholds({ targetLow: 70 })).toBeNull();
    expect(
      validateThresholds({ alertLow: 70, targetLow: 70, targetHigh: 180, alertHigh: 180 }),
    ).toBeNull();
  });

  it('requires targetLow < targetHigh', () => {
    expect(validateThresholds({ targetLow: 180, targetHigh: 180 })).not.toBeNull();
    expect(validateThresholds({ targetLow: 200, targetHigh: 180 })).not.toBeNull();
  });

  it('requires alertLow ≤ targetLow and targetHigh ≤ alertHigh', () => {
    expect(validateThresholds({ alertLow: 71, targetLow: 70 })).not.toBeNull();
    expect(validateThresholds({ targetHigh: 180, alertHigh: 179 })).not.toBeNull();
  });

  it('checks order among whichever values are present', () => {
    expect(validateThresholds({ alertLow: 200, targetHigh: 180 })).not.toBeNull();
    expect(validateThresholds({ alertLow: 250, alertHigh: 250 })).not.toBeNull();
    expect(validateThresholds({ targetLow: 260, alertHigh: 250 })).not.toBeNull();
    expect(validateThresholds({ alertLow: 54, alertHigh: 250 })).toBeNull();
  });

  it('rejects non-finite values', () => {
    expect(validateThresholds({ targetLow: Number.NaN })).not.toBeNull();
  });
});

describe('evaluateStatus', () => {
  it('is unconfigured when no thresholds exist', () => {
    expect(evaluateStatus(GLUCOSE, defaultMetricConfig(GLUCOSE, NOW), g(500))).toBe('unconfigured');
    expect(evaluateStatus(GLUCOSE, glucoseConfig({}), g(500))).toBe('unconfigured');
  });

  it.each<[number, StatusKind]>([
    [53, 'below_alert'],
    [54, 'below_target'],
    [69, 'below_target'],
    [70, 'in_range'],
    [180, 'in_range'],
    [181, 'above_target'],
    [250, 'above_target'],
    [251, 'above_alert'],
  ])('%d mg/dL → %s (boundaries inclusive in range)', (v, kind) => {
    expect(evaluateStatus(GLUCOSE, glucoseConfig(FULL), g(v))).toBe(kind);
  });

  it('only counts thresholds that are defined', () => {
    const cfg = glucoseConfig({ targetHigh: 180 });
    expect(evaluateStatus(GLUCOSE, cfg, g(20))).toBe('in_range');
    expect(evaluateStatus(GLUCOSE, cfg, g(181))).toBe('above_target');
    expect(evaluateStatus(GLUCOSE, glucoseConfig({ alertLow: 54 }), g(53))).toBe('below_alert');
  });

  it('converts the measurement into the config unit before comparing', () => {
    const cfg = glucoseConfig({ targetLow: 3.9, targetHigh: 10 }, 'mmol/L');
    expect(evaluateStatus(GLUCOSE, cfg, g(100))).toBe('in_range'); // ≈ 5.55 mmol/L
    expect(evaluateStatus(GLUCOSE, cfg, g(181))).toBe('above_target'); // ≈ 10.05
    expect(evaluateStatus(GLUCOSE, glucoseConfig(FULL), g(2.9, 'mmol/L'))).toBe('below_alert'); // ≈ 52.2 mg/dL
    expect(evaluateStatus(GLUCOSE, glucoseConfig(FULL), g(3.0, 'mmol/L'))).toBe('below_target'); // ≈ 54.05 mg/dL
  });

  it('uses the most severe status across BP threshold fields', () => {
    const cfg: MetricConfig = {
      ...defaultMetricConfig(BLOOD_PRESSURE, NOW),
      thresholds: {
        systolic: { targetLow: 90, targetHigh: 140, alertHigh: 180 },
        diastolic: { targetLow: 60, targetHigh: 90, alertHigh: 120 },
      },
    };
    const bp = (s: number, d: number) =>
      reading({ systolic: s, diastolic: d }, 'mmHg', 'blood_pressure');
    expect(evaluateStatus(BLOOD_PRESSURE, cfg, bp(120, 80))).toBe('in_range');
    expect(evaluateStatus(BLOOD_PRESSURE, cfg, bp(150, 80))).toBe('above_target');
    expect(evaluateStatus(BLOOD_PRESSURE, cfg, bp(150, 125))).toBe('above_alert');
    expect(evaluateStatus(BLOOD_PRESSURE, cfg, bp(120, 50))).toBe('below_target');
  });

  it('ignores non-threshold fields such as pulse', () => {
    const cfg: MetricConfig = {
      ...defaultMetricConfig(BLOOD_PRESSURE, NOW),
      thresholds: { pulse: { targetHigh: 100 } },
    };
    const m = reading({ systolic: 120, diastolic: 80, pulse: 150 }, 'mmHg', 'blood_pressure');
    expect(evaluateStatus(BLOOD_PRESSURE, cfg, m)).toBe('unconfigured');
  });

  it('evaluates a BP metric configured on one field only', () => {
    const cfg: MetricConfig = {
      ...defaultMetricConfig(BLOOD_PRESSURE, NOW),
      thresholds: { systolic: { targetHigh: 140 } },
    };
    const m = reading({ systolic: 120, diastolic: 110 }, 'mmHg', 'blood_pressure');
    expect(evaluateStatus(BLOOD_PRESSURE, cfg, m)).toBe('in_range');
  });
});

describe('statusLabel', () => {
  it.each<[StatusKind, string]>([
    ['in_range', 'In target range'],
    ['below_target', 'Below target range'],
    ['above_target', 'Above target range'],
    ['below_alert', 'Below low alert'],
    ['above_alert', 'Above high alert'],
    ['unconfigured', 'No target range configured'],
  ])('%s → %s', (kind, label) => {
    expect(statusLabel(kind)).toBe(label);
  });
});

describe('statusIsConcerning', () => {
  it.each<[StatusKind, boolean]>([
    ['in_range', false],
    ['unconfigured', false],
    ['below_target', true],
    ['above_target', true],
    ['below_alert', true],
    ['above_alert', true],
  ])('%s → %s', (kind, expected) => {
    expect(statusIsConcerning(kind)).toBe(expected);
  });
});

describe('convertThresholds', () => {
  it('converts every defined value and leaves absent ones absent', () => {
    const t = convertThresholds({ targetLow: 70, targetHigh: 180 }, 'mg/dL', 'mmol/L');
    expect(Object.keys(t).sort()).toEqual(['targetHigh', 'targetLow']);
    expect(t.targetLow).toBeCloseTo(3.8855, 4);
    expect(t.targetHigh).toBeCloseTo(9.9913, 4);
  });

  it('is identity for the same unit', () => {
    expect(convertThresholds(FULL, 'mg/dL', 'mg/dL')).toEqual(FULL);
  });

  it('throws for incompatible units', () => {
    expect(() => convertThresholds(FULL, 'mg/dL', 'kg')).toThrow();
  });
});
