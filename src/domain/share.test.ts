import { describe, expect, it } from 'vitest';
import { BLOOD_PRESSURE, GLUCOSE } from './metrics';
import { readingShareText, summaryShareText } from './share';
import type { Measurement } from './types';

// Tests run with TZ=America/New_York; 21:53Z on 2026-11-03 is 4:53 PM EST.
function meas(over: Partial<Measurement> = {}): Measurement {
  return {
    id: 'm1',
    metricId: 'glucose',
    value: { value: 112 },
    raw: { value: '112' },
    unit: 'mg/dL',
    takenAt: '2026-11-03T21:53:00.000Z',
    timeZone: 'America/New_York',
    source: 'manual',
    createdAt: '2026-11-03T21:53:00.000Z',
    updatedAt: '2026-11-03T21:53:00.000Z',
    ...over,
  };
}

const FOOTER = 'Recorded with Sugar Daddy. Not medical advice.';

describe('readingShareText', () => {
  it('formats value, unit, context, date and status', () => {
    const text = readingShareText(
      GLUCOSE,
      meas({ context: 'before_meal' }),
      'mg/dL',
      'in_range',
      'en-US',
    );
    expect(text).toBe(
      `Glucose: 112 mg/dL · Before meal · Tue, Nov 3, 2026, 4:53 PM\nIn target range\n\n${FOOTER}`,
    );
  });

  it('omits the status line when no target range is configured', () => {
    const text = readingShareText(GLUCOSE, meas(), 'mg/dL', 'unconfigured', 'en-US');
    expect(text).toBe(`Glucose: 112 mg/dL · Tue, Nov 3, 2026, 4:53 PM\n\n${FOOTER}`);
    expect(text).not.toContain('No target range configured');
  });

  it('uses the status label for concerning statuses', () => {
    const text = readingShareText(GLUCOSE, meas(), 'mg/dL', 'above_alert', 'en-US');
    expect(text.split('\n')[1]).toBe('Above high alert');
  });

  it('converts to the display unit', () => {
    const text = readingShareText(
      GLUCOSE,
      meas({ value: { value: 108 } }),
      'mmol/L',
      'unconfigured',
      'en-US',
    );
    expect(text.split('\n')[0]).toBe('Glucose: 6.0 mmol/L · Tue, Nov 3, 2026, 4:53 PM');
  });

  it('formats blood pressure as systolic/diastolic with the pulse unit separate', () => {
    const bp = meas({
      metricId: 'blood_pressure',
      unit: 'mmHg',
      value: { systolic: 120, diastolic: 80 },
      raw: { systolic: '120', diastolic: '80' },
    });
    expect(readingShareText(BLOOD_PRESSURE, bp, 'mmHg', 'unconfigured', 'en-US')).toBe(
      `Blood pressure: 120/80 mmHg · Tue, Nov 3, 2026, 4:53 PM\n\n${FOOTER}`,
    );
    const withPulse = { ...bp, value: { ...bp.value, pulse: 72 } };
    expect(
      readingShareText(BLOOD_PRESSURE, withPulse, 'mmHg', 'unconfigured', 'en-US').split('\n')[0],
    ).toBe('Blood pressure: 120/80 mmHg · 72 bpm · Tue, Nov 3, 2026, 4:53 PM');
  });

  it('never includes the note', () => {
    const text = readingShareText(
      GLUCOSE,
      meas({ note: 'secret note text', context: 'fasting' }),
      'mg/dL',
      'in_range',
      'en-US',
    );
    expect(text).not.toContain('secret');
  });
});

describe('summaryShareText', () => {
  const a = meas({ id: 'a', takenAt: '2026-11-03T21:53:00.000Z', context: 'before_meal' });
  const b = meas({
    id: 'b',
    takenAt: '2026-11-03T13:05:00.000Z',
    value: { value: 98 },
    note: 'private',
  });

  it('lists readings oldest to newest with a header count and footer', () => {
    expect(summaryShareText(GLUCOSE, [a, b], 'Today', 'mg/dL', 'en-US')).toBe(
      [
        'Glucose readings — Today (2)',
        'Nov 3, 8:05 AM — 98 mg/dL',
        'Nov 3, 4:53 PM — 112 mg/dL · Before meal',
        '',
        FOOTER,
      ].join('\n'),
    );
  });

  it('does not mutate the input list', () => {
    const list = [a, b];
    summaryShareText(GLUCOSE, list, 'Today', 'mg/dL', 'en-US');
    expect(list.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('never includes notes', () => {
    const text = summaryShareText(GLUCOSE, [a, b], 'Today', 'mg/dL', 'en-US');
    expect(text).not.toContain('private');
  });

  it('formats blood pressure readings', () => {
    const bp = meas({
      metricId: 'blood_pressure',
      unit: 'mmHg',
      value: { systolic: 120, diastolic: 80 },
      raw: { systolic: '120', diastolic: '80' },
      note: 'hidden',
    });
    expect(summaryShareText(BLOOD_PRESSURE, [bp], 'This week', 'mmHg', 'en-US')).toBe(
      `Blood pressure readings — This week (1)\nNov 3, 4:53 PM — 120/80 mmHg\n\n${FOOTER}`,
    );
  });

  it('says so when there are no readings', () => {
    expect(summaryShareText(GLUCOSE, [], 'This week', 'mg/dL', 'en-US')).toBe(
      `No glucose readings in This week.\n\n${FOOTER}`,
    );
  });
});
