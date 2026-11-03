import { describe, expect, it } from 'vitest';
import { CSV_HEADERS, csvFilename, escapeCsvField, guardFormula, measurementsToCsv } from './csv';
import type { FieldDef, Measurement, MetricDefinition, MetricRegistry, Unit } from './types';

// ---------------------------------------------------------------------------
// TEST FIXTURE: a minimal local MetricRegistry. Not the production registry
// (src/domain/metrics.ts); just enough shape to exercise CSV export.
// ---------------------------------------------------------------------------
const lim = () => ({ min: 0, max: 1000, maxDecimals: 1 });
const field = (key: string, label: string, unitLabel?: string): FieldDef => ({
  key,
  label,
  required: true,
  ...(unitLabel ? { unitLabel } : {}),
  limits: lim,
});
const fixtureDefs: MetricDefinition[] = [
  {
    id: 'glucose',
    name: 'Glucose',
    shortName: 'Glucose',
    logLabel: 'Log glucose',
    units: ['mg/dL', 'mmol/L'],
    defaultUnit: 'mg/dL',
    fields: [field('value', 'Glucose')],
    primaryField: 'value',
    thresholdFields: ['value'],
    defaultEnabled: true,
    order: 0,
    contexts: [
      { key: 'before_meal', label: 'Before meal' },
      { key: 'other', label: 'Other' },
    ],
  },
  {
    id: 'blood_pressure',
    name: 'Blood pressure',
    shortName: 'BP',
    logLabel: 'Log blood pressure',
    units: ['mmHg'],
    defaultUnit: 'mmHg',
    fields: [
      field('systolic', 'Systolic'),
      field('diastolic', 'Diastolic'),
      field('pulse', 'Pulse', 'bpm'),
    ],
    primaryField: 'systolic',
    thresholdFields: ['systolic', 'diastolic'],
    defaultEnabled: false,
    order: 1,
  },
];
const fixtureRegistry: MetricRegistry = {
  all: () => fixtureDefs,
  get: (id) => fixtureDefs.find((d) => d.id === id),
  require: (id) => {
    const d = fixtureDefs.find((x) => x.id === id);
    if (!d) throw new Error(`unknown metric ${id}`);
    return d;
  },
};

function m(over: Partial<Measurement> & { value: Record<string, number> }): Measurement {
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(over.value)) raw[k] = String(v);
  return {
    id: 'id-1',
    metricId: 'glucose',
    raw,
    unit: 'mg/dL' as Unit,
    takenAt: '2026-11-03T12:30:00.000Z',
    timeZone: 'America/New_York',
    source: 'manual',
    createdAt: '2026-11-03T12:31:00.000Z',
    updatedAt: '2026-11-03T12:32:00.000Z',
    ...over,
  };
}

/** Small RFC 4180 parser used only to verify the exporter's output. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let fieldBuf = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text.charAt(i);
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          fieldBuf += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      fieldBuf += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ',') {
      row.push(fieldBuf);
      fieldBuf = '';
      i++;
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(fieldBuf);
      rows.push(row);
      row = [];
      fieldBuf = '';
      i += 2;
    } else {
      fieldBuf += c;
      i++;
    }
  }
  if (inQuotes) throw new Error('unterminated quote');
  if (fieldBuf !== '' || row.length > 0) {
    row.push(fieldBuf);
    rows.push(row);
  }
  return rows;
}

function body(csv: string): string[][] {
  expect(csv.startsWith('\uFEFF')).toBe(true);
  return parseCsv(csv.slice(1));
}

describe('escapeCsvField', () => {
  it('leaves plain text untouched', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField('')).toBe('');
  });
  it.each([
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['cr\rhere', '"cr\rhere"'],
    [' lead', '" lead"'],
    ['trail ', '"trail "'],
  ])('quotes %j', (input, expected) => {
    expect(escapeCsvField(input)).toBe(expected);
  });
});

describe('guardFormula', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx'])('prefixes %j with an apostrophe', (v) => {
    expect(guardFormula(v)).toBe(`'${v}`);
  });
  it('leaves safe text alone', () => {
    expect(guardFormula('felt fine')).toBe('felt fine');
    expect(guardFormula('')).toBe('');
    expect(guardFormula('a=b')).toBe('a=b');
  });
});

describe('CSV_HEADERS', () => {
  it('lists the exact columns in order', () => {
    expect(CSV_HEADERS).toEqual([
      'id',
      'metric',
      'field',
      'value',
      'unit',
      'entered_as',
      'taken_at_local',
      'time_zone',
      'taken_at_utc',
      'note',
      'context',
      'source',
      'created_at',
      'updated_at',
    ]);
  });
});

describe('measurementsToCsv', () => {
  it('starts with a BOM, uses CRLF and ends with CRLF', () => {
    const csv = measurementsToCsv([m({ value: { value: 120 } })], fixtureRegistry);
    expect(csv.startsWith('\uFEFFid,metric,field,')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });

  it('emits only the header when there are no measurements', () => {
    expect(measurementsToCsv([], fixtureRegistry)).toBe(`\uFEFF${CSV_HEADERS.join(',')}\r\n`);
  });

  it('writes one full row for a glucose reading', () => {
    const rows = body(
      measurementsToCsv(
        [m({ value: { value: 120.5 }, raw: { value: '120.50' }, note: 'after lunch' })],
        fixtureRegistry,
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual([
      'id-1',
      'Glucose',
      'value',
      '120.5',
      'mg/dL',
      '120.50',
      '2026-11-03 07:30',
      'America/New_York',
      '2026-11-03T12:30:00.000Z',
      'after lunch',
      '',
      'manual',
      '2026-11-03T12:31:00.000Z',
      '2026-11-03T12:32:00.000Z',
    ]);
  });

  it('writes one row per present field in definition order, with field unit labels', () => {
    const bp = m({
      id: 'bp-1',
      metricId: 'blood_pressure',
      unit: 'mmHg',
      value: { pulse: 70, diastolic: 80, systolic: 120 },
    });
    const rows = body(measurementsToCsv([bp], fixtureRegistry)).slice(1);
    expect(rows.map((r) => [r[2], r[3], r[4]])).toEqual([
      ['systolic', '120', 'mmHg'],
      ['diastolic', '80', 'mmHg'],
      ['pulse', '70', 'bpm'],
    ]);
    expect(rows.every((r) => r[1] === 'Blood pressure')).toBe(true);
  });

  it('omits fields that are absent from the measurement', () => {
    const bp = m({
      metricId: 'blood_pressure',
      unit: 'mmHg',
      value: { systolic: 120, diastolic: 80 },
    });
    const rows = body(measurementsToCsv([bp], fixtureRegistry)).slice(1);
    expect(rows.map((r) => r[2])).toEqual(['systolic', 'diastolic']);
  });

  it('falls back to the metric id when the metric is unknown', () => {
    const odd = m({ metricId: 'mystery', value: { a: 1 } });
    const rows = body(measurementsToCsv([odd], fixtureRegistry)).slice(1);
    expect(rows[0]?.[1]).toBe('mystery');
    expect(rows[0]?.[2]).toBe('a');
  });

  it('sorts rows by takenAt ascending', () => {
    const later = m({ id: 'later', takenAt: '2026-11-03T15:00:00.000Z', value: { value: 1 } });
    const earlier = m({ id: 'earlier', takenAt: '2026-11-02T15:00:00.000Z', value: { value: 2 } });
    const rows = body(measurementsToCsv([later, earlier], fixtureRegistry)).slice(1);
    expect(rows.map((r) => r[0])).toEqual(['earlier', 'later']);
  });

  it('does not mutate the input array', () => {
    const a = m({ id: 'a', takenAt: '2026-11-03T15:00:00.000Z', value: { value: 1 } });
    const b = m({ id: 'b', takenAt: '2026-11-02T15:00:00.000Z', value: { value: 2 } });
    const input = [a, b];
    measurementsToCsv(input, fixtureRegistry);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('writes the exact stored number via String(n)', () => {
    const rows = body(
      measurementsToCsv([m({ value: { value: 0.1 + 0.2 } })], fixtureRegistry),
    ).slice(1);
    expect(rows[0]?.[3]).toBe(String(0.1 + 0.2));
  });

  it('formats local time in the measurement zone, not the device zone', () => {
    const tokyo = m({
      timeZone: 'Asia/Tokyo',
      takenAt: '2026-11-03T23:05:00.000Z',
      value: { value: 1 },
    });
    const rows = body(measurementsToCsv([tokyo], fixtureRegistry)).slice(1);
    expect(rows[0]?.[6]).toBe('2026-11-04 08:05');
  });

  it('formats midnight as 00:00 rather than 24:00', () => {
    const mid = m({ timeZone: 'UTC', takenAt: '2026-11-03T00:00:00.000Z', value: { value: 1 } });
    expect(body(measurementsToCsv([mid], fixtureRegistry))[1]?.[6]).toBe('2026-11-03 00:00');
  });

  it('handles DST in the measurement zone', () => {
    // 2026-11-01 is the US fall-back day; 05:30Z = 01:30 EDT, 06:30Z = 01:30 EST.
    const a = m({ id: 'a', takenAt: '2026-11-01T05:30:00.000Z', value: { value: 1 } });
    const b = m({ id: 'b', takenAt: '2026-11-01T06:30:00.000Z', value: { value: 1 } });
    const rows = body(measurementsToCsv([a, b], fixtureRegistry)).slice(1);
    expect(rows.map((r) => r[6])).toEqual(['2026-11-01 01:30', '2026-11-01 01:30']);
  });

  it('falls back to the device zone for an invalid zone', () => {
    // Tests run with TZ=America/New_York.
    const bad = m({
      timeZone: 'Not/AZone',
      takenAt: '2026-11-03T12:30:00.000Z',
      value: { value: 1 },
    });
    const rows = body(measurementsToCsv([bad], fixtureRegistry)).slice(1);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
    expect(rows[0]?.[6]).toBe('2026-11-03 07:30');
    expect(rows[0]?.[7]).toBe('Not/AZone');
  });

  it('guards formula-like notes and entered_as values', () => {
    const evil = m({ value: { value: -1 }, raw: { value: '-1' }, note: '=HYPERLINK("x")' });
    const rows = body(measurementsToCsv([evil], fixtureRegistry)).slice(1);
    expect(rows[0]?.[5]).toBe("'-1");
    expect(rows[0]?.[9]).toBe('\'=HYPERLINK("x")');
  });

  it('guards a formula-like id', () => {
    const evil = m({ id: '=HYPERLINK("http://evil","x")', value: { value: 1 } });
    const rows = body(measurementsToCsv([evil], fixtureRegistry)).slice(1);
    expect(rows[0]?.[0]).toBe('\'=HYPERLINK("http://evil","x")');
  });

  it('guards formula-like time zone, unit, metric, field and timestamp cells', () => {
    const evil = m({
      metricId: '+mystery',
      value: { '@f': 1 },
      raw: { '@f': '1' },
      unit: '-x' as Unit,
      timeZone: '=1+1',
      takenAt: '2026-11-03T12:30:00.000Z',
      createdAt: '=c',
      updatedAt: '@u',
      source: '=s' as Measurement['source'],
    });
    const r = body(measurementsToCsv([evil], fixtureRegistry))[1] ?? [];
    expect(r[1]).toBe("'+mystery");
    expect(r[2]).toBe("'@f");
    expect(r[4]).toBe("'-x");
    expect(r[7]).toBe("'=1+1");
    expect(r[11]).toBe("'=s");
    expect(r[12]).toBe("'=c");
    expect(r[13]).toBe("'@u");
  });

  it('writes the context label right after the note', () => {
    const rows = body(
      measurementsToCsv(
        [m({ value: { value: 1 }, note: 'n', context: 'before_meal' })],
        fixtureRegistry,
      ),
    );
    const at = CSV_HEADERS.indexOf('context');
    expect(at).toBe(CSV_HEADERS.indexOf('note') + 1);
    expect(rows[1]?.[at]).toBe('Before meal');
  });

  it('falls back to the context key when it has no label, formula-guarded', () => {
    const rows = body(
      measurementsToCsv(
        [
          m({ id: 'a', value: { value: 1 }, context: 'legacy' }),
          m({ id: 'b', value: { value: 1 }, context: '=cmd' }),
          m({ id: 'c', metricId: 'mystery', value: { a: 1 }, context: 'x' }),
        ],
        fixtureRegistry,
      ),
    );
    const at = CSV_HEADERS.indexOf('context');
    expect(rows.slice(1).map((r) => r[at])).toEqual(['legacy', "'=cmd", 'x']);
  });

  it('does not guard the numeric value cell (negative numbers stay numbers)', () => {
    const rows = body(measurementsToCsv([m({ value: { value: -1 } })], fixtureRegistry)).slice(1);
    expect(rows[0]?.[3]).toBe('-1');
  });

  it('leaves an empty note as an empty cell', () => {
    const rows = body(measurementsToCsv([m({ value: { value: 1 } })], fixtureRegistry)).slice(1);
    expect(rows[0]?.[9]).toBe('');
  });

  it.each([
    ['comma', 'a, b, c'],
    ['quotes', 'he said "fine"'],
    ['LF', 'line1\nline2'],
    ['CR', 'line1\rline2'],
    ['CRLF', 'line1\r\nline2'],
    ['unicode', 'café 🍬 日本語'],
    ['leading space', '  padded  '],
  ])('round-trips a note containing %s', (_name, note) => {
    const rows = body(measurementsToCsv([m({ value: { value: 1 }, note })], fixtureRegistry));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveLength(CSV_HEADERS.length);
    expect(rows[1]?.[9]).toBe(note);
  });

  it('round-trips a note with a leading = as a guarded value', () => {
    const rows = body(
      measurementsToCsv([m({ value: { value: 1 }, note: '=1+1, "x"' })], fixtureRegistry),
    );
    expect(rows[1]?.[9]).toBe('\'=1+1, "x"');
  });
});

describe('csvFilename', () => {
  it('uses the scope and the local date', () => {
    // 2026-11-04T03:00Z is still Nov 3 in New York.
    const now = new Date('2026-11-04T03:00:00.000Z');
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(csvFilename('all', now)).toBe(`sugar-daddy-all-${d}.csv`);
    expect(csvFilename('glucose', new Date(2026, 0, 5, 12))).toBe(
      'sugar-daddy-glucose-2026-01-05.csv',
    );
  });
});
