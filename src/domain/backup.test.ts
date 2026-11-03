import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFilename,
  buildBackup,
  parseBackup,
  planRestore,
  type BackupFile,
} from './backup';
import {
  DEFAULT_SETTINGS,
  type AppSnapshot,
  type FieldDef,
  type Measurement,
  type MetricDefinition,
  type MetricRegistry,
} from './types';

// ---------------------------------------------------------------------------
// TEST FIXTURE: a minimal local MetricRegistry (not the production one).
// ---------------------------------------------------------------------------
const lim = () => ({ min: 0, max: 1000, maxDecimals: 1 });
const field = (key: string, required = true, unitLabel?: string): FieldDef => ({
  key,
  label: key,
  required,
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
    fields: [field('value')],
    primaryField: 'value',
    thresholdFields: ['value'],
    defaultEnabled: true,
    order: 0,
  },
  {
    id: 'blood_pressure',
    name: 'Blood pressure',
    shortName: 'BP',
    logLabel: 'Log blood pressure',
    units: ['mmHg'],
    defaultUnit: 'mmHg',
    fields: [field('systolic'), field('diastolic'), field('pulse', false, 'bpm')],
    primaryField: 'systolic',
    thresholdFields: ['systolic', 'diastolic'],
    defaultEnabled: false,
    order: 1,
  },
];
const registry: MetricRegistry = {
  all: () => fixtureDefs,
  get: (id) => fixtureDefs.find((d) => d.id === id),
  require: (id) => {
    const d = fixtureDefs.find((x) => x.id === id);
    if (!d) throw new Error(`unknown metric ${id}`);
    return d;
  },
};

const T = '2026-11-03T12:00:00.000Z';
const NOW = new Date('2026-11-03T15:00:00.000Z');

function meas(id: string, over: Partial<Measurement> = {}): Measurement {
  return {
    id,
    metricId: 'glucose',
    value: { value: 110 },
    raw: { value: '110' },
    unit: 'mg/dL',
    takenAt: T,
    timeZone: 'America/New_York',
    source: 'manual',
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

function sampleSnapshot(): AppSnapshot {
  return {
    settings: {
      tone: 'neutral',
      textSize: 'large',
      graceMinutes: 90,
      notificationsEnabled: true,
      lastBackupAt: T,
      firstRunDone: true,
    },
    metricConfigs: [
      {
        metricId: 'glucose',
        enabled: true,
        unit: 'mg/dL',
        thresholds: { value: { targetLow: 70, targetHigh: 180, alertLow: 54, alertHigh: 250 } },
        createdAt: T,
        updatedAt: T,
      },
      {
        metricId: 'blood_pressure',
        enabled: true,
        unit: 'mmHg',
        thresholds: { systolic: { targetHigh: 140 } },
        createdAt: T,
        updatedAt: T,
      },
    ],
    reminders: [
      { id: 'r1', time: '08:00', metricId: 'glucose', enabled: true, createdAt: T, updatedAt: T },
      {
        id: 'r2',
        time: '20:30',
        metricId: 'blood_pressure',
        enabled: false,
        createdAt: T,
        updatedAt: T,
      },
    ],
    dismissals: [{ id: 'r1@2026-11-02', reminderId: 'r1', date: '2026-11-02', createdAt: T }],
    measurements: [
      meas('m1', { note: 'before breakfast, "fasting"' }),
      meas('m2', {
        metricId: 'blood_pressure',
        unit: 'mmHg',
        value: { systolic: 120, diastolic: 80, pulse: 66 },
        raw: { systolic: '120', diastolic: '80', pulse: '66' },
        source: 'import',
      }),
      meas('m3', { value: { value: 6.15 }, raw: { value: '6.15' }, unit: 'mmol/L' }),
    ],
  };
}

function emptySnapshot(): AppSnapshot {
  return {
    settings: { ...DEFAULT_SETTINGS },
    metricConfigs: [],
    reminders: [],
    dismissals: [],
    measurements: [],
  };
}

/** Build a backup JSON object, apply a mutation, and parse it. */
// Tests deliberately poke invalid shapes into the parsed JSON, so loose typing is intended.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseJson = any;
function parseMutated(mutate: (b: LooseJson) => void) {
  const b = JSON.parse(JSON.stringify(buildBackup(sampleSnapshot(), NOW, '1.0.0'))) as LooseJson;
  mutate(b);
  return parseBackup(JSON.stringify(b), registry);
}

function errorOf(r: ReturnType<typeof parseBackup>): string {
  if (r.ok) throw new Error('expected parse failure');
  return r.error;
}

describe('buildBackup', () => {
  it('wraps the snapshot with format, version, time and app info', () => {
    const snap = sampleSnapshot();
    const b = buildBackup(snap, NOW, '1.2.3');
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(BACKUP_FORMAT).toBe('sugar-daddy-backup');
    expect(b.version).toBe(BACKUP_VERSION);
    expect(BACKUP_VERSION).toBe(1);
    expect(b.exportedAt).toBe(NOW.toISOString());
    expect(b.app).toEqual({ name: 'Sugar Daddy', version: '1.2.3' });
    expect(b.data).toEqual(snap);
  });

  it('does not share references with the input snapshot', () => {
    const snap = sampleSnapshot();
    const b = buildBackup(snap, NOW, '1.0.0');
    const first = b.data.measurements[0];
    if (first) first.value.value = 999;
    expect(snap.measurements[0]?.value.value).toBe(110);
  });
});

describe('backupFilename', () => {
  it('uses the local date', () => {
    expect(backupFilename(new Date(2026, 10, 3, 23, 59))).toBe(
      'sugar-daddy-backup-2026-11-03.json',
    );
  });
});

describe('parseBackup: accepts', () => {
  it('a valid backup', () => {
    const b = buildBackup(sampleSnapshot(), NOW, '1.0.0');
    const r = parseBackup(JSON.stringify(b), registry);
    expect(r).toEqual({ ok: true, value: b });
  });

  it('settings without lastBackupAt and measurements without a note', () => {
    const r = parseMutated((b) => {
      delete b.data.settings.lastBackupAt;
      delete b.data.measurements[0].note;
    });
    expect(r.ok).toBe(true);
  });

  it('a measurement missing an optional field', () => {
    const r = parseMutated((b) => {
      delete b.data.measurements[1].value.pulse;
      delete b.data.measurements[1].raw.pulse;
    });
    expect(r.ok).toBe(true);
  });
});

describe('parseBackup: rejects', () => {
  it('text over 20 MB', () => {
    const big = ' '.repeat(20 * 1024 * 1024 + 1);
    expect(errorOf(parseBackup(big, registry))).toMatch(/too large/i);
  });

  it('invalid JSON', () => {
    expect(errorOf(parseBackup('{not json', registry))).toMatch(
      /not a valid backup file|could not be read/i,
    );
  });

  it.each(['null', '[]', '42', '"x"'])('non-object JSON %s', (text) => {
    expect(errorOf(parseBackup(text, registry))).toMatch(/not a Sugar Daddy backup/);
  });

  it('a wrong format id', () => {
    expect(errorOf(parseMutated((b) => (b.format = 'other-app')))).toMatch(
      /not a Sugar Daddy backup/,
    );
  });

  it('a newer version', () => {
    expect(errorOf(parseMutated((b) => (b.version = BACKUP_VERSION + 1)))).toMatch(
      /This backup was made by a newer version of Sugar Daddy/,
    );
  });

  it.each([0, 1.5, '1', null])('a non-integer or invalid version %j', (v) => {
    expect(errorOf(parseMutated((b) => (b.version = v)))).toMatch(/version/i);
  });

  it('an invalid exportedAt', () => {
    expect(errorOf(parseMutated((b) => (b.exportedAt = 'yesterday')))).toMatch(/export date/i);
  });

  it('missing app info', () => {
    expect(errorOf(parseMutated((b) => delete b.app))).toMatch(/app/i);
  });

  it('missing data', () => {
    expect(errorOf(parseMutated((b) => delete b.data))).toMatch(/no data/i);
  });

  it.each(['measurements', 'reminders', 'dismissals', 'metricConfigs'])('a non-array %s', (key) => {
    expect(errorOf(parseMutated((b) => (b.data[key] = {})))).toMatch(/list/i);
  });

  // Settings
  it.each([
    ['tone', 'sarcastic'],
    ['textSize', 'huge'],
    ['graceMinutes', 14],
    ['graceMinutes', 241],
    ['graceMinutes', 'sixty'],
    ['notificationsEnabled', 'yes'],
    ['firstRunDone', 1],
    ['lastBackupAt', 'not a date'],
  ])('invalid settings.%s = %j', (key, v) => {
    expect(errorOf(parseMutated((b) => (b.data.settings[key] = v)))).toMatch(/^Settings/);
  });

  it('missing settings', () => {
    expect(errorOf(parseMutated((b) => delete b.data.settings))).toMatch(/^Settings/);
  });

  // Measurements: messages name the 1-based index.
  it('an invalid measurement date, naming the record', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[2].takenAt = '2026-13-45')))).toBe(
      'Measurement 3 has an invalid date.',
    );
  });

  it.each(['createdAt', 'updatedAt'])('an invalid measurement %s', (key) => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0][key] = 12345)))).toBe(
      'Measurement 1 has an invalid date.',
    );
  });

  it('a date without a time', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0].takenAt = '2026-11-03')))).toBe(
      'Measurement 1 has an invalid date.',
    );
  });

  it('an unknown metric id', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[1].metricId = 'mood')))).toMatch(
      /^Measurement 2 .*unknown metric/,
    );
  });

  it('duplicate measurement ids', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[2].id = 'm1')))).toMatch(
      /^Measurement 3 .*same ID/,
    );
  });

  it.each([
    ['id', ''],
    ['id', 5],
    ['timeZone', ''],
    ['source', 'sync'],
    ['note', 42],
    ['value', null],
    ['raw', 'x'],
  ])('measurement field %s = %j', (key, v) => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0][key] = v)))).toMatch(
      /^Measurement 1 /,
    );
  });

  it('a wrong unit', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0].unit = 'stone')))).toMatch(
      /^Measurement 1 .*unit/,
    );
  });

  it('a unit the metric does not support', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0].unit = 'kg')))).toMatch(
      /^Measurement 1 .*unit/,
    );
  });

  it.each([
    ['a string number', '110'],
    ['null (NaN/Infinity after JSON)', null],
  ])('a non-finite or non-number value: %s', (_n, v) => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0].value.value = v)))).toMatch(
      /^Measurement 1 .*number/,
    );
  });

  it('a field key not in the metric definition', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0].value.extra = 1)))).toMatch(
      /^Measurement 1 .*"extra"/,
    );
  });

  it('a raw key not in the metric definition', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0].raw.extra = '1')))).toMatch(
      /^Measurement 1 .*"extra"/,
    );
  });

  it('a non-string raw value', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0].raw.value = 110)))).toMatch(
      /^Measurement 1 /,
    );
  });

  it('a missing required field', () => {
    expect(
      errorOf(
        parseMutated((b) => {
          delete b.data.measurements[1].value.diastolic;
        }),
      ),
    ).toMatch(/^Measurement 2 .*diastolic/);
  });

  it('a non-object measurement', () => {
    expect(errorOf(parseMutated((b) => (b.data.measurements[0] = 'oops')))).toMatch(
      /^Measurement 1 /,
    );
  });

  // Reminders
  it.each([
    ['time', '25:00'],
    ['time', '8:00'],
    ['enabled', 'true'],
    ['metricId', 'mood'],
    ['id', ''],
    ['createdAt', 'nope'],
  ])('reminder field %s = %j', (key, v) => {
    expect(errorOf(parseMutated((b) => (b.data.reminders[1][key] = v)))).toMatch(/^Reminder 2 /);
  });

  it('duplicate reminder ids', () => {
    expect(errorOf(parseMutated((b) => (b.data.reminders[1].id = 'r1')))).toMatch(
      /^Reminder 2 .*same ID/,
    );
  });

  // Dismissals
  it.each([
    ['date', '2026-11-32'],
    ['reminderId', ''],
    ['id', 'mismatch'],
    ['createdAt', null],
  ])('dismissal field %s = %j', (key, v) => {
    expect(errorOf(parseMutated((b) => (b.data.dismissals[0][key] = v)))).toMatch(/^Dismissal 1 /);
  });

  it('duplicate dismissal ids', () => {
    expect(
      errorOf(parseMutated((b) => b.data.dismissals.push({ ...b.data.dismissals[0] }))),
    ).toMatch(/^Dismissal 2 .*same ID/);
  });

  // Metric configs
  it.each([
    ['metricId', 'mood'],
    ['enabled', 0],
    ['unit', 'kg'],
    ['thresholds', null],
    ['updatedAt', ''],
  ])('metric config field %s = %j', (key, v) => {
    expect(errorOf(parseMutated((b) => (b.data.metricConfigs[0][key] = v)))).toMatch(
      /^Metric setting 1 /,
    );
  });

  it('a threshold for a field the metric does not have', () => {
    expect(
      errorOf(parseMutated((b) => (b.data.metricConfigs[0].thresholds.extra = { targetLow: 1 }))),
    ).toMatch(/^Metric setting 1 .*"extra"/);
  });

  it('a non-number threshold', () => {
    expect(
      errorOf(parseMutated((b) => (b.data.metricConfigs[0].thresholds.value.targetLow = '70'))),
    ).toMatch(/^Metric setting 1 .*number/);
  });

  it('an unknown threshold key', () => {
    expect(
      errorOf(parseMutated((b) => (b.data.metricConfigs[0].thresholds.value.dangerLow = 1))),
    ).toMatch(/^Metric setting 1 /);
  });

  it('duplicate metric configs', () => {
    expect(
      errorOf(parseMutated((b) => b.data.metricConfigs.push({ ...b.data.metricConfigs[0] }))),
    ).toMatch(/^Metric setting 3 .*more than once/);
  });
});

describe('planRestore', () => {
  function backupOf(snap: AppSnapshot): BackupFile {
    return buildBackup(snap, NOW, '1.0.0');
  }

  it('merge keeps existing records on duplicate id and adds new ones', () => {
    const existing = emptySnapshot();
    existing.measurements = [meas('m1', { note: 'local edit' }), meas('local-only')];
    existing.reminders = [
      { id: 'r1', time: '09:00', metricId: 'glucose', enabled: true, createdAt: T, updatedAt: T },
    ];
    const plan = planRestore(existing, backupOf(sampleSnapshot()), 'merge');
    expect(plan.mode).toBe('merge');
    expect(plan.snapshot.measurements.map((m) => m.id)).toEqual(['m1', 'local-only', 'm2', 'm3']);
    expect(plan.snapshot.measurements[0]?.note).toBe('local edit');
    expect(plan.snapshot.reminders.map((r) => [r.id, r.time])).toEqual([
      ['r1', '09:00'],
      ['r2', '20:30'],
    ]);
    expect(plan.counts).toEqual({
      measurementsNew: 2,
      measurementsDuplicate: 1,
      remindersNew: 1,
      remindersDuplicate: 1,
      total: 3,
    });
  });

  it('merge keeps existing settings', () => {
    const existing = emptySnapshot();
    const plan = planRestore(existing, backupOf(sampleSnapshot()), 'merge');
    expect(plan.snapshot.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('merge adds metric configs only where missing locally', () => {
    const existing = emptySnapshot();
    existing.metricConfigs = [
      {
        metricId: 'glucose',
        enabled: true,
        unit: 'mmol/L',
        thresholds: {},
        createdAt: T,
        updatedAt: T,
      },
    ];
    const plan = planRestore(existing, backupOf(sampleSnapshot()), 'merge');
    expect(plan.snapshot.metricConfigs.map((c) => [c.metricId, c.unit])).toEqual([
      ['glucose', 'mmol/L'],
      ['blood_pressure', 'mmHg'],
    ]);
  });

  it('merge unions dismissals by id', () => {
    const existing = emptySnapshot();
    existing.dismissals = [
      {
        id: 'r1@2026-11-02',
        reminderId: 'r1',
        date: '2026-11-02',
        createdAt: '2026-11-02T20:00:00.000Z',
      },
      { id: 'r1@2026-11-01', reminderId: 'r1', date: '2026-11-01', createdAt: T },
    ];
    const plan = planRestore(existing, backupOf(sampleSnapshot()), 'merge');
    expect(plan.snapshot.dismissals).toEqual(existing.dismissals);
  });

  it('replace uses the backup data verbatim', () => {
    const existing = emptySnapshot();
    existing.measurements = [meas('m1', { note: 'local edit' }), meas('local-only')];
    const snap = sampleSnapshot();
    const plan = planRestore(existing, backupOf(snap), 'replace');
    expect(plan.mode).toBe('replace');
    expect(plan.snapshot).toEqual(snap);
    expect(plan.counts.total).toBe(3);
    expect(plan.counts.measurementsDuplicate).toBe(1);
    expect(plan.counts.measurementsNew).toBe(2);
  });

  it('does not mutate its inputs', () => {
    const existing = emptySnapshot();
    existing.measurements = [meas('x')];
    const before = JSON.stringify(existing);
    const backup = backupOf(sampleSnapshot());
    const backupBefore = JSON.stringify(backup);
    const plan = planRestore(existing, backup, 'merge');
    plan.snapshot.measurements.push(meas('y'));
    expect(JSON.stringify(existing)).toBe(before);
    expect(JSON.stringify(backup)).toBe(backupBefore);
  });
});

describe('full round trip', () => {
  it('buildBackup → JSON → parseBackup → planRestore(empty, merge) restores the snapshot', () => {
    const snap = sampleSnapshot();
    const text = JSON.stringify(buildBackup(snap, NOW, '1.0.0'));
    const parsed = parseBackup(text, registry);
    if (!parsed.ok) throw new Error(parsed.error);
    // An empty install with the backup's settings (merge keeps local settings by design).
    const empty: AppSnapshot = { ...emptySnapshot(), settings: { ...snap.settings } };
    const plan = planRestore(empty, parsed.value, 'merge');
    expect(plan.snapshot).toEqual(snap);
    expect(plan.counts).toEqual({
      measurementsNew: 3,
      measurementsDuplicate: 0,
      remindersNew: 2,
      remindersDuplicate: 0,
      total: 3,
    });
  });

  it('round trip with replace into a default install restores everything including settings', () => {
    const snap = sampleSnapshot();
    const parsed = parseBackup(JSON.stringify(buildBackup(snap, NOW, '1.0.0')), registry);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(planRestore(emptySnapshot(), parsed.value, 'replace').snapshot).toEqual(snap);
  });
});
