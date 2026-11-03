import { describe, expect, it } from 'vitest';
import { buildMeasurement, reviseMeasurement } from './measurement';
import { BLOOD_PRESSURE, GLUCOSE } from './metrics';
import type { Measurement, MeasurementInput } from './types';

const NOW = new Date('2026-11-03T15:00:00.000Z');
const newId = () => 'id-1';

function input(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    metricId: 'glucose',
    raw: { value: '112' },
    unit: 'mg/dL',
    takenAt: '2026-11-03T14:55:00.000Z',
    timeZone: 'America/New_York',
    ...overrides,
  };
}

function ok<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
}

describe('buildMeasurement', () => {
  it('builds a manual measurement with exact value and trimmed raw', () => {
    const m = ok(buildMeasurement(GLUCOSE, input({ raw: { value: ' 112 ' } }), NOW, newId));
    expect(m).toEqual({
      id: 'id-1',
      metricId: 'glucose',
      value: { value: 112 },
      raw: { value: '112' },
      unit: 'mg/dL',
      takenAt: '2026-11-03T14:55:00.000Z',
      timeZone: 'America/New_York',
      source: 'manual',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect('note' in m).toBe(false);
  });

  it('never rounds the entered value; raw keeps the typed comma', () => {
    const m = ok(
      buildMeasurement(GLUCOSE, input({ raw: { value: '5,57' }, unit: 'mmol/L' }), NOW, newId),
    );
    expect(m.value.value).toBe(5.57);
    expect(m.raw.value).toBe('5,57');
    expect(m.unit).toBe('mmol/L');
  });

  it('omits empty optional fields from value and raw', () => {
    const m = ok(
      buildMeasurement(
        BLOOD_PRESSURE,
        input({
          metricId: 'blood_pressure',
          raw: { systolic: '120', diastolic: '80', pulse: '  ' },
          unit: 'mmHg',
        }),
        NOW,
        newId,
      ),
    );
    expect(m.value).toEqual({ systolic: 120, diastolic: 80 });
    expect(m.raw).toEqual({ systolic: '120', diastolic: '80' });
  });

  it('trims the note; empty note becomes undefined', () => {
    expect(
      ok(buildMeasurement(GLUCOSE, input({ note: '  after lunch \n' }), NOW, newId)).note,
    ).toBe('after lunch');
    expect(ok(buildMeasurement(GLUCOSE, input({ note: '   ' }), NOW, newId)).note).toBeUndefined();
  });

  it('returns field errors from validation', () => {
    expect(buildMeasurement(GLUCOSE, input({ raw: { value: '5' } }), NOW, newId)).toEqual({
      ok: false,
      error: { value: 'Enter a number between 10 and 1000 mg/dL.' },
    });
  });

  it('rejects an invalid takenAt', () => {
    const r = buildMeasurement(GLUCOSE, input({ takenAt: 'not a date' }), NOW, newId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.takenAt).toBe('Enter a valid date and time.');
  });

  it('allows takenAt up to 5 minutes ahead; rejects beyond', () => {
    expect(
      buildMeasurement(GLUCOSE, input({ takenAt: '2026-11-03T15:05:00.000Z' }), NOW, newId).ok,
    ).toBe(true);
    const r = buildMeasurement(GLUCOSE, input({ takenAt: '2026-11-03T15:05:01.000Z' }), NOW, newId);
    expect(r).toEqual({
      ok: false,
      error: { takenAt: 'Time cannot be in the future.' },
    });
  });

  it('combines field and takenAt errors', () => {
    const r = buildMeasurement(
      GLUCOSE,
      input({ raw: { value: '' }, takenAt: '2027-01-01T00:00:00.000Z' }),
      NOW,
      newId,
    );
    expect(r).toEqual({
      ok: false,
      error: { value: 'Enter a number.', takenAt: 'Time cannot be in the future.' },
    });
  });

  it('normalises takenAt to an ISO UTC instant', () => {
    const m = ok(
      buildMeasurement(GLUCOSE, input({ takenAt: '2026-11-03T09:30:00-05:00' }), NOW, newId),
    );
    expect(m.takenAt).toBe('2026-11-03T14:30:00.000Z');
  });

  it('rejects a unit the metric does not support', () => {
    const r = buildMeasurement(GLUCOSE, input({ unit: 'kg' }), NOW, newId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.unit).toBe('Choose a supported unit.');
  });

  it('rejects an input for a different metric', () => {
    const r = buildMeasurement(GLUCOSE, input({ metricId: 'weight' }), NOW, newId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.metricId).toBeDefined();
  });
});

describe('reviseMeasurement', () => {
  const existing: Measurement = {
    id: 'orig',
    metricId: 'glucose',
    value: { value: 100 },
    raw: { value: '100' },
    unit: 'mg/dL',
    takenAt: '2026-11-02T10:00:00.000Z',
    timeZone: 'America/New_York',
    note: 'old',
    source: 'import',
    createdAt: '2026-11-02T10:01:00.000Z',
    updatedAt: '2026-11-02T10:01:00.000Z',
  };

  it('keeps id/createdAt/source and updates fields and updatedAt', () => {
    const later = new Date('2026-11-03T16:00:00.000Z');
    const m = ok(
      reviseMeasurement(
        existing,
        GLUCOSE,
        input({ raw: { value: '130' }, note: '', takenAt: '2026-11-02T11:00:00.000Z' }),
        later,
      ),
    );
    expect(m).toEqual({
      id: 'orig',
      metricId: 'glucose',
      value: { value: 130 },
      raw: { value: '130' },
      unit: 'mg/dL',
      takenAt: '2026-11-02T11:00:00.000Z',
      timeZone: 'America/New_York',
      source: 'import',
      createdAt: '2026-11-02T10:01:00.000Z',
      updatedAt: later.toISOString(),
    });
  });

  it('returns validation errors', () => {
    expect(reviseMeasurement(existing, GLUCOSE, input({ raw: { value: 'x' } }), NOW)).toEqual({
      ok: false,
      error: { value: 'Enter a number.' },
    });
  });
});

describe('reading context', () => {
  it('stores a valid context key, trimmed', () => {
    const m = ok(buildMeasurement(GLUCOSE, input({ context: ' before_meal ' }), NOW, newId));
    expect(m.context).toBe('before_meal');
  });

  it.each([[''], ['   '], [undefined]])('omits an empty context (%j)', (context) => {
    const m = ok(buildMeasurement(GLUCOSE, input({ context }), NOW, newId));
    expect('context' in m).toBe(false);
  });

  it('rejects a context that is not in the list', () => {
    const r = buildMeasurement(GLUCOSE, input({ context: 'lunch' }), NOW, newId);
    expect(r).toEqual({ ok: false, error: { context: 'Choose an option from the list.' } });
  });

  it('rejects any context for a metric without contexts', () => {
    const r = buildMeasurement(
      BLOOD_PRESSURE,
      input({
        metricId: 'blood_pressure',
        raw: { systolic: '120', diastolic: '80' },
        unit: 'mmHg',
        context: 'before_meal',
      }),
      NOW,
      newId,
    );
    expect(r).toEqual({ ok: false, error: { context: 'Choose an option from the list.' } });
  });

  it('reports a context error alongside field errors', () => {
    const r = buildMeasurement(GLUCOSE, input({ raw: { value: '' }, context: 'x' }), NOW, newId);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.context).toBe('Choose an option from the list.');
      expect(r.error.value).toBeDefined();
    }
  });

  it('revise sets, changes and clears the context from the input', () => {
    const base = ok(buildMeasurement(GLUCOSE, input(), NOW, newId));
    const later = new Date(NOW.getTime() + 60_000);
    const set = ok(reviseMeasurement(base, GLUCOSE, input({ context: 'fasting' }), later));
    expect(set.context).toBe('fasting');
    const changed = ok(reviseMeasurement(set, GLUCOSE, input({ context: 'bedtime' }), later));
    expect(changed.context).toBe('bedtime');
    const cleared = ok(reviseMeasurement(changed, GLUCOSE, input({ context: '' }), later));
    expect('context' in cleared).toBe(false);
    const omitted = ok(reviseMeasurement(changed, GLUCOSE, input(), later));
    expect('context' in omitted).toBe(false);
  });

  it('revise rejects an unknown context', () => {
    const base = ok(buildMeasurement(GLUCOSE, input(), NOW, newId));
    const r = reviseMeasurement(base, GLUCOSE, input({ context: 'nope' }), NOW);
    expect(r).toEqual({ ok: false, error: { context: 'Choose an option from the list.' } });
  });
});
