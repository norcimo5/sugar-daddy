import { targetFraction } from './ringFraction';
import { GLUCOSE } from '../domain/metrics';
import type { Measurement, MetricConfig } from '../domain/types';

const cfg = (
  t: MetricConfig['thresholds'],
  thresholdUnit?: MetricConfig['unit'],
): MetricConfig => ({
  metricId: 'glucose',
  enabled: true,
  unit: 'mg/dL',
  thresholds: t,
  thresholdUnit,
  createdAt: '',
  updatedAt: '',
});
const m = (v: number, unit: Measurement['unit'] = 'mg/dL'): Measurement => ({
  id: 'x',
  metricId: 'glucose',
  value: { value: v },
  raw: { value: String(v) },
  unit,
  takenAt: '2026-01-01T00:00:00.000Z',
  timeZone: 'UTC',
  source: 'manual',
  createdAt: '',
  updatedAt: '',
});

describe('targetFraction', () => {
  it('is null when no complete target range is configured (no invented scale)', () => {
    expect(targetFraction(GLUCOSE, cfg({}), m(100))).toBeNull();
    expect(targetFraction(GLUCOSE, cfg({ value: { targetLow: 70 } }), m(100))).toBeNull();
  });
  it('is the position inside the target range, clamped to 0..1', () => {
    const c = cfg({ value: { targetLow: 70, targetHigh: 170 } });
    expect(targetFraction(GLUCOSE, c, m(120))).toBeCloseTo(0.5);
    expect(targetFraction(GLUCOSE, c, m(40))).toBe(0);
    expect(targetFraction(GLUCOSE, c, m(300))).toBe(1);
  });
  it('compares in the unit the thresholds were entered in', () => {
    const c = cfg({ value: { targetLow: 4, targetHigh: 10 } }, 'mmol/L');
    expect(targetFraction(GLUCOSE, c, m(7, 'mmol/L'))).toBeCloseTo(0.5);
  });
});
