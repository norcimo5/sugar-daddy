import { describe, expect, it } from 'vitest';
import { BLOOD_PRESSURE, GLUCOSE, KETONES, WEIGHT } from './metrics';
import { parseNumber, validateFields } from './validation';

describe('parseNumber', () => {
  it.each([
    ['120', 120],
    ['  98 ', 98],
    ['5.5', 5.5],
    ['1,5', 1.5],
    ['0', 0],
    ['007', 7],
    ['12.50', 12.5],
  ])('parses %j → %d', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'abc',
    '1e3',
    '-5',
    '+5',
    '12.',
    '.5',
    '1.2.3',
    '1,2,3',
    '12 3',
    'Infinity',
    '0x10',
  ])('rejects %j', (raw) => {
    expect(parseNumber(raw)).toBeNull();
  });
});

describe('validateFields: single-value metrics', () => {
  it('accepts a valid glucose value and returns the exact parsed number', () => {
    expect(validateFields(GLUCOSE, { value: '112' }, 'mg/dL')).toEqual({
      ok: true,
      value: { value: 112 },
    });
  });

  it('requires a number', () => {
    expect(validateFields(GLUCOSE, { value: '' }, 'mg/dL')).toEqual({
      ok: false,
      error: { value: 'Enter a number.' },
    });
    expect(validateFields(GLUCOSE, {}, 'mg/dL')).toEqual({
      ok: false,
      error: { value: 'Enter a number.' },
    });
    expect(validateFields(GLUCOSE, { value: 'abc' }, 'mg/dL')).toEqual({
      ok: false,
      error: { value: 'Enter a number.' },
    });
  });

  it('min and max are inclusive', () => {
    expect(validateFields(GLUCOSE, { value: '10' }, 'mg/dL').ok).toBe(true);
    expect(validateFields(GLUCOSE, { value: '1000' }, 'mg/dL').ok).toBe(true);
    expect(validateFields(GLUCOSE, { value: '0.5' }, 'mmol/L').ok).toBe(true);
    expect(validateFields(GLUCOSE, { value: '55' }, 'mmol/L').ok).toBe(true);
    expect(validateFields(KETONES, { value: '0' }, 'mmol/L').ok).toBe(true);
    expect(validateFields(KETONES, { value: '15' }, 'mmol/L').ok).toBe(true);
  });

  it('reports out-of-range without clamping', () => {
    expect(validateFields(GLUCOSE, { value: '9' }, 'mg/dL')).toEqual({
      ok: false,
      error: { value: 'Enter a number between 10 and 1000 mg/dL.' },
    });
    expect(validateFields(GLUCOSE, { value: '1001' }, 'mg/dL')).toEqual({
      ok: false,
      error: { value: 'Enter a number between 10 and 1000 mg/dL.' },
    });
    expect(validateFields(GLUCOSE, { value: '0.4' }, 'mmol/L')).toEqual({
      ok: false,
      error: { value: 'Enter a number between 0.5 and 55 mmol/L.' },
    });
    expect(validateFields(WEIGHT, { value: '1101' }, 'lb')).toEqual({
      ok: false,
      error: { value: 'Enter a number between 2 and 1100 lb.' },
    });
  });

  it('enforces decimal-place limits', () => {
    expect(validateFields(GLUCOSE, { value: '112.5' }, 'mg/dL')).toEqual({
      ok: false,
      error: { value: 'Use at most 0 decimal places.' },
    });
    expect(validateFields(GLUCOSE, { value: '5.55' }, 'mmol/L')).toEqual({
      ok: true,
      value: { value: 5.55 },
    });
    expect(validateFields(GLUCOSE, { value: '5.555' }, 'mmol/L')).toEqual({
      ok: false,
      error: { value: 'Use at most 2 decimal places.' },
    });
    expect(validateFields(WEIGHT, { value: '72,35' }, 'kg')).toEqual({
      ok: true,
      value: { value: 72.35 },
    });
  });

  it('counts trailing zeros as typed decimal places', () => {
    expect(validateFields(GLUCOSE, { value: '100.0' }, 'mg/dL').ok).toBe(false);
  });
});

describe('validateFields: blood pressure', () => {
  it('accepts systolic/diastolic without pulse (optional omitted)', () => {
    expect(
      validateFields(BLOOD_PRESSURE, { systolic: '120', diastolic: '80', pulse: '' }, 'mmHg'),
    ).toEqual({ ok: true, value: { systolic: 120, diastolic: 80 } });
  });

  it('accepts pulse when given', () => {
    expect(
      validateFields(BLOOD_PRESSURE, { systolic: '120', diastolic: '80', pulse: '72' }, 'mmHg'),
    ).toEqual({ ok: true, value: { systolic: 120, diastolic: 80, pulse: 72 } });
  });

  it('uses bpm in pulse range errors', () => {
    expect(
      validateFields(BLOOD_PRESSURE, { systolic: '120', diastolic: '80', pulse: '300' }, 'mmHg'),
    ).toEqual({ ok: false, error: { pulse: 'Enter a number between 20 and 250 bpm.' } });
  });

  it('collects errors for each field', () => {
    expect(validateFields(BLOOD_PRESSURE, { systolic: '', diastolic: '10' }, 'mmHg')).toEqual({
      ok: false,
      error: {
        systolic: 'Enter a number.',
        diastolic: 'Enter a number between 20 and 200 mmHg.',
      },
    });
  });

  it('errors when diastolic ≥ systolic', () => {
    const err = { ok: false, error: { diastolic: 'Diastolic must be lower than systolic.' } };
    expect(validateFields(BLOOD_PRESSURE, { systolic: '80', diastolic: '80' }, 'mmHg')).toEqual(
      err,
    );
    expect(validateFields(BLOOD_PRESSURE, { systolic: '80', diastolic: '90' }, 'mmHg')).toEqual(
      err,
    );
    expect(validateFields(BLOOD_PRESSURE, { systolic: '81', diastolic: '80' }, 'mmHg').ok).toBe(
      true,
    );
  });

  it('ignores keys that are not fields of the metric', () => {
    expect(validateFields(GLUCOSE, { value: '100', bogus: 'x' }, 'mg/dL')).toEqual({
      ok: true,
      value: { value: 100 },
    });
  });
});
