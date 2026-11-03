import { describe, expect, it } from 'vitest';
import {
  GLUCOSE_MGDL_PER_MMOLL,
  LB_PER_KG,
  convertValue,
  displayDecimals,
  formatNumber,
} from './units';

describe('constants', () => {
  it('exposes conversion factors', () => {
    expect(GLUCOSE_MGDL_PER_MMOLL).toBe(18.0156);
    expect(LB_PER_KG).toBe(2.20462262185);
  });
});

describe('convertValue', () => {
  it('is identity when units are equal', () => {
    expect(convertValue(123.456, 'mg/dL', 'mg/dL')).toBe(123.456);
    expect(convertValue(120, 'mmHg', 'mmHg')).toBe(120);
  });

  it('converts 100 mg/dL to ≈ 5.5507 mmol/L', () => {
    expect(convertValue(100, 'mg/dL', 'mmol/L')).toBeCloseTo(5.5507, 4);
  });

  it('converts mmol/L to mg/dL', () => {
    expect(convertValue(5.5, 'mmol/L', 'mg/dL')).toBeCloseTo(99.0858, 4);
  });

  it('round-trips glucose', () => {
    const back = convertValue(convertValue(137, 'mg/dL', 'mmol/L'), 'mmol/L', 'mg/dL');
    expect(back).toBeCloseTo(137, 10);
  });

  it('converts kg to lb and back', () => {
    expect(convertValue(1, 'kg', 'lb')).toBeCloseTo(2.20462, 5);
    expect(convertValue(70, 'kg', 'lb')).toBeCloseTo(154.3236, 4);
    expect(convertValue(220.462262185, 'lb', 'kg')).toBeCloseTo(100, 10);
    expect(convertValue(convertValue(81.3, 'kg', 'lb'), 'lb', 'kg')).toBeCloseTo(81.3, 10);
  });

  it('throws on incompatible units', () => {
    expect(() => convertValue(1, 'mg/dL', 'kg')).toThrow();
    expect(() => convertValue(1, 'mmHg', 'mmol/L')).toThrow();
    expect(() => convertValue(1, 'lb', 'mg/dL')).toThrow();
  });
});

describe('displayDecimals', () => {
  it('returns per-unit display precision', () => {
    expect(displayDecimals('mg/dL')).toBe(0);
    expect(displayDecimals('mmol/L')).toBe(1);
    expect(displayDecimals('mmHg')).toBe(0);
    expect(displayDecimals('kg')).toBe(1);
    expect(displayDecimals('lb')).toBe(1);
  });
});

describe('formatNumber', () => {
  it('formats with fixed decimals', () => {
    expect(formatNumber(5.5507, 1)).toBe('5.6');
    expect(formatNumber(120, 0)).toBe('120');
    expect(formatNumber(70, 1)).toBe('70.0');
  });

  it('does not render negative zero', () => {
    expect(formatNumber(-0.01, 1)).toBe('0.0');
  });
});
