import { IDBFactory } from 'fake-indexeddb';
import {
  DEFAULT_SETTINGS,
  type AppSnapshot,
  type Dismissal,
  type Measurement,
  type MetricConfig,
  type MetricDefinition,
  type MetricRegistry,
  type Reminder,
} from '../domain/types';
import { StorageError, openDatabase } from './idb';
import { createRepo, type Repo } from './repo';

// ---------------------------------------------------------------------------
// TEST FIXTURE ONLY: a minimal local metric registry. Not the real built-ins
// (src/domain/metrics.ts); just enough shape for the repository to work with.
// ---------------------------------------------------------------------------
function fixtureDef(
  id: string,
  order: number,
  defaultEnabled: boolean,
  defaultUnit: MetricDefinition['defaultUnit'],
): MetricDefinition {
  return {
    id,
    name: id,
    shortName: id,
    logLabel: `Log ${id}`,
    units: [defaultUnit],
    defaultUnit,
    fields: [
      {
        key: 'value',
        label: 'Value',
        required: true,
        limits: () => ({ min: 0, max: 1000, maxDecimals: 1 }),
      },
    ],
    primaryField: 'value',
    thresholdFields: ['value'],
    defaultEnabled,
    order,
  };
}
const FIXTURE_DEFS = [
  fixtureDef('weight', 3, false, 'kg'),
  fixtureDef('glucose', 1, true, 'mg/dL'),
  fixtureDef('blood_pressure', 2, false, 'mmHg'),
];
const fixtureRegistry: MetricRegistry = {
  all: () => [...FIXTURE_DEFS].sort((a, b) => a.order - b.order),
  get: (id) => FIXTURE_DEFS.find((d) => d.id === id),
  require: (id) => {
    const d = FIXTURE_DEFS.find((x) => x.id === id);
    if (!d) throw new Error(`unknown metric ${id}`);
    return d;
  },
};
// ---------------------------------------------------------------------------

let db: IDBDatabase;
let repo: Repo;
let dbCounter = 0;

beforeEach(async () => {
  db = await openDatabase({ name: `repo-test-${++dbCounter}`, idb: new IDBFactory() });
  repo = createRepo(db, fixtureRegistry);
});

afterEach(() => {
  db.close();
});

function meas(id: string, takenAt: string, over: Partial<Measurement> = {}): Measurement {
  return {
    id,
    metricId: 'glucose',
    value: { value: 100 },
    raw: { value: '100' },
    unit: 'mg/dL',
    takenAt,
    timeZone: 'America/New_York',
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function reminder(id: string, over: Partial<Reminder> = {}): Reminder {
  return {
    id,
    time: '08:00',
    metricId: 'glucose',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function dismissal(reminderId: string, date: string): Dismissal {
  return {
    id: `${reminderId}@${date}`,
    reminderId,
    date,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('measurements', () => {
  it('starts empty', async () => {
    expect(await repo.listMeasurements()).toEqual([]);
  });

  it('puts, reads back, updates and deletes', async () => {
    const m = meas('a', '2026-03-01T10:00:00.000Z', { note: 'before breakfast' });
    await repo.putMeasurement(m);
    expect(await repo.listMeasurements()).toEqual([m]);
    const m2 = { ...m, value: { value: 101.5 }, raw: { value: '101.5' } };
    await repo.putMeasurement(m2);
    expect(await repo.listMeasurements()).toEqual([m2]);
    await repo.deleteMeasurement('a');
    expect(await repo.listMeasurements()).toEqual([]);
  });

  it('deleting a missing id resolves', async () => {
    await expect(repo.deleteMeasurement('nope')).resolves.toBeUndefined();
  });

  it('lists in descending takenAt order, tie-broken by createdAt desc then id desc', async () => {
    await repo.putMeasurement(meas('old', '2026-03-01T08:00:00.000Z'));
    await repo.putMeasurement(meas('new', '2026-03-03T08:00:00.000Z'));
    await repo.putMeasurement(
      meas('tieA', '2026-03-02T08:00:00.000Z', { createdAt: '2026-03-02T09:00:00.000Z' }),
    );
    await repo.putMeasurement(
      meas('tieB', '2026-03-02T08:00:00.000Z', { createdAt: '2026-03-02T09:00:00.000Z' }),
    );
    await repo.putMeasurement(
      meas('tie0Late', '2026-03-02T08:00:00.000Z', { createdAt: '2026-03-02T10:00:00.000Z' }),
    );
    const ids = (await repo.listMeasurements()).map((m) => m.id);
    expect(ids).toEqual(['new', 'tie0Late', 'tieB', 'tieA', 'old']);
  });

  describe('filters', () => {
    beforeEach(async () => {
      await repo.putMeasurement(meas('g1', '2026-03-01T00:00:00.000Z'));
      await repo.putMeasurement(meas('g2', '2026-03-02T00:00:00.000Z'));
      await repo.putMeasurement(meas('g3', '2026-03-03T00:00:00.000Z'));
      await repo.putMeasurement(
        meas('w1', '2026-03-02T00:00:00.000Z', { metricId: 'weight', unit: 'kg' }),
      );
    });

    it('filters by metricId', async () => {
      expect((await repo.listMeasurements({ metricId: 'weight' })).map((m) => m.id)).toEqual([
        'w1',
      ]);
      expect((await repo.listMeasurements({ metricId: 'glucose' })).map((m) => m.id)).toEqual([
        'g3',
        'g2',
        'g1',
      ]);
      expect(await repo.listMeasurements({ metricId: 'ketones' })).toEqual([]);
    });

    it('from is inclusive, to is exclusive', async () => {
      const from = new Date('2026-03-02T00:00:00.000Z');
      const to = new Date('2026-03-03T00:00:00.000Z');
      expect((await repo.listMeasurements({ from, to })).map((m) => m.id).sort()).toEqual([
        'g2',
        'w1',
      ]);
      expect((await repo.listMeasurements({ from })).map((m) => m.id).sort()).toEqual([
        'g2',
        'g3',
        'w1',
      ]);
      expect((await repo.listMeasurements({ to })).map((m) => m.id).sort()).toEqual([
        'g1',
        'g2',
        'w1',
      ]);
    });

    it('combines metricId with a range', async () => {
      const from = new Date('2026-03-02T00:00:00.000Z');
      const to = new Date('2026-03-04T00:00:00.000Z');
      expect(
        (await repo.listMeasurements({ metricId: 'glucose', from, to })).map((m) => m.id),
      ).toEqual(['g3', 'g2']);
    });

    it('handles a range expressed in a local time zone', async () => {
      // 2026-03-02 local New York midnight = 05:00Z
      const from = new Date(2026, 2, 1, 19, 0, 0); // 2026-03-02T00:00Z in EST
      expect((await repo.listMeasurements({ metricId: 'glucose', from })).map((m) => m.id)).toEqual(
        ['g3', 'g2'],
      );
    });
  });
});

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', async () => {
    const s = { ...DEFAULT_SETTINGS, tone: 'neutral' as const, graceMinutes: 90 };
    await repo.saveSettings(s);
    expect(await repo.getSettings()).toEqual(s);
  });

  it('merges stored partial settings over defaults', async () => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ key: 'settings', value: { tone: 'neutral' } });
    await new Promise((r) => (tx.oncomplete = r));
    expect(await repo.getSettings()).toEqual({ ...DEFAULT_SETTINGS, tone: 'neutral' });
  });
});

describe('metric configs', () => {
  it('returns defaults for every built-in, sorted by order', async () => {
    const configs = await repo.listMetricConfigs();
    expect(configs.map((c) => c.metricId)).toEqual(['glucose', 'blood_pressure', 'weight']);
    expect(configs[0]).toMatchObject({
      metricId: 'glucose',
      enabled: true,
      unit: 'mg/dL',
      thresholds: {},
    });
    expect(configs[2]).toMatchObject({ metricId: 'weight', enabled: false, unit: 'kg' });
    const [first] = configs;
    expect(typeof first?.createdAt).toBe('string');
    expect(first?.createdAt).toBe(first?.updatedAt);
  });

  it('returns saved config in place of the default', async () => {
    const c: MetricConfig = {
      metricId: 'weight',
      enabled: true,
      unit: 'kg',
      thresholds: { value: { targetLow: 60, targetHigh: 80 } },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    await repo.saveMetricConfig(c);
    const configs = await repo.listMetricConfigs();
    expect(configs.map((x) => x.metricId)).toEqual(['glucose', 'blood_pressure', 'weight']);
    expect(configs[2]).toEqual(c);
  });

  it('keeps stored configs for unknown metrics after the built-ins', async () => {
    const c: MetricConfig = {
      metricId: 'zz_custom',
      enabled: true,
      unit: 'kg',
      thresholds: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await repo.saveMetricConfig(c);
    const ids = (await repo.listMetricConfigs()).map((x) => x.metricId);
    expect(ids).toEqual(['glucose', 'blood_pressure', 'weight', 'zz_custom']);
  });

  it('does not persist defaults', async () => {
    await repo.listMetricConfigs();
    const snap = await repo.snapshot();
    expect(snap.metricConfigs).toEqual([]);
  });
});

describe('reminders and dismissals', () => {
  it('CRUD reminders', async () => {
    expect(await repo.listReminders()).toEqual([]);
    await repo.putReminder(reminder('r1'));
    await repo.putReminder(reminder('r2', { time: '20:00' }));
    expect((await repo.listReminders()).map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    await repo.putReminder(reminder('r1', { enabled: false }));
    expect((await repo.listReminders()).find((r) => r.id === 'r1')?.enabled).toBe(false);
  });

  it('deleteReminder also removes only that reminder’s dismissals', async () => {
    await repo.putReminder(reminder('r1'));
    await repo.putReminder(reminder('r2'));
    await repo.putDismissal(dismissal('r1', '2026-03-01'));
    await repo.putDismissal(dismissal('r1', '2026-03-02'));
    await repo.putDismissal(dismissal('r2', '2026-03-01'));
    await repo.deleteReminder('r1');
    expect((await repo.listReminders()).map((r) => r.id)).toEqual(['r2']);
    expect((await repo.listDismissals()).map((d) => d.id)).toEqual(['r2@2026-03-01']);
  });

  it('putDismissal is idempotent per id', async () => {
    await repo.putDismissal(dismissal('r1', '2026-03-01'));
    await repo.putDismissal(dismissal('r1', '2026-03-01'));
    expect(await repo.listDismissals()).toHaveLength(1);
  });
});

function fullSnapshot(): AppSnapshot {
  return {
    settings: { ...DEFAULT_SETTINGS, tone: 'neutral', firstRunDone: true },
    metricConfigs: [
      {
        metricId: 'glucose',
        enabled: true,
        unit: 'mmol/L',
        thresholds: { value: { targetLow: 4, targetHigh: 10 } },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    reminders: [reminder('rs')],
    dismissals: [dismissal('rs', '2026-03-01')],
    measurements: [meas('s1', '2026-03-05T00:00:00.000Z'), meas('s2', '2026-03-04T00:00:00.000Z')],
  };
}

describe('snapshot / applySnapshot', () => {
  it('snapshot of an empty db', async () => {
    expect(await repo.snapshot()).toEqual({
      settings: DEFAULT_SETTINGS,
      metricConfigs: [],
      reminders: [],
      dismissals: [],
      measurements: [],
    });
  });

  it('replace round-trips and removes existing data', async () => {
    await repo.putMeasurement(meas('existing', '2026-01-01T00:00:00.000Z'));
    await repo.putReminder(reminder('rold'));
    await repo.putDismissal(dismissal('rold', '2026-01-01'));
    await repo.saveMetricConfig({
      ...(fullSnapshot().metricConfigs[0] as MetricConfig),
      metricId: 'weight',
      unit: 'kg',
    });
    const s = fullSnapshot();
    await repo.applySnapshot(s, 'replace');
    const out = await repo.snapshot();
    expect(out.settings).toEqual(s.settings);
    expect(out.metricConfigs).toEqual(s.metricConfigs);
    expect(out.reminders).toEqual(s.reminders);
    expect(out.dismissals).toEqual(s.dismissals);
    expect(out.measurements.map((m) => m.id)).toEqual(['s1', 's2']);
  });

  it('merge keeps existing data and upserts incoming', async () => {
    await repo.putMeasurement(meas('existing', '2026-01-01T00:00:00.000Z'));
    await repo.putMeasurement(meas('s1', '2026-03-05T00:00:00.000Z', { note: 'old' }));
    const s = fullSnapshot();
    await repo.applySnapshot(s, 'merge');
    const ms = await repo.listMeasurements();
    expect(ms.map((m) => m.id)).toEqual(['s1', 's2', 'existing']);
    expect(ms[0]?.note).toBeUndefined();
    expect(ms[0]?.id).toBe('s1');
    expect(await repo.getSettings()).toEqual(s.settings);
    expect((await repo.listReminders()).map((r) => r.id)).toEqual(['rs']);
  });

  it('a failed replace leaves prior data intact (atomic)', async () => {
    await repo.putMeasurement(meas('keep', '2026-01-01T00:00:00.000Z'));
    await repo.putReminder(reminder('rkeep'));
    const s = fullSnapshot();
    // invalid record: missing keyPath `id`
    s.measurements.push({ ...meas('x', '2026-03-06T00:00:00.000Z'), id: undefined } as never);
    await expect(repo.applySnapshot(s, 'replace')).rejects.toBeInstanceOf(StorageError);
    expect((await repo.listMeasurements()).map((m) => m.id)).toEqual(['keep']);
    expect((await repo.listReminders()).map((r) => r.id)).toEqual(['rkeep']);
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('a failed merge writes nothing', async () => {
    const s = fullSnapshot();
    s.reminders.push({ ...reminder('bad'), id: undefined } as never);
    await expect(repo.applySnapshot(s, 'merge')).rejects.toBeInstanceOf(StorageError);
    expect(await repo.snapshot()).toEqual({
      settings: DEFAULT_SETTINGS,
      metricConfigs: [],
      reminders: [],
      dismissals: [],
      measurements: [],
    });
  });
});

describe('write failures', () => {
  it('rejects with a generic StorageError for an invalid record', async () => {
    const bad = { ...meas('a', '2026-01-01T00:00:00.000Z'), id: undefined } as never;
    const p = repo.putMeasurement(bad);
    await expect(p).rejects.toBeInstanceOf(StorageError);
    await expect(p).rejects.toThrow(
      "Sugar Daddy couldn't save to this device's storage. Nothing was saved.",
    );
  });

  it('maps QuotaExceededError to the out-of-space message', async () => {
    const realTx = db.transaction.bind(db);
    const spy = vi.spyOn(db, 'transaction').mockImplementation(((
      names: string | string[],
      mode?: IDBTransactionMode,
    ) => {
      const tx = realTx(names, mode);
      queueMicrotask(() => {
        tx.abort();
        Object.defineProperty(tx, 'error', {
          configurable: true,
          get: () => new DOMException('full', 'QuotaExceededError'),
        });
      });
      return tx;
    }) as typeof db.transaction);
    const p = repo.putMeasurement(meas('a', '2026-01-01T00:00:00.000Z'));
    await expect(p).rejects.toThrow('Your device is out of storage space. Nothing was saved.');
    await expect(p).rejects.toMatchObject({
      cause: expect.objectContaining({ name: 'QuotaExceededError' }),
    });
    spy.mockRestore();
    expect(await repo.listMeasurements()).toEqual([]);
  });

  it('does not resolve before the transaction completes', async () => {
    const order: string[] = [];
    const realTx = db.transaction.bind(db);
    const spy = vi.spyOn(db, 'transaction').mockImplementation(((
      names: string | string[],
      mode?: IDBTransactionMode,
    ) => {
      const tx = realTx(names, mode);
      tx.addEventListener('complete', () => order.push('complete'));
      return tx;
    }) as typeof db.transaction);
    await repo.putMeasurement(meas('a', '2026-01-01T00:00:00.000Z'));
    order.push('resolved');
    spy.mockRestore();
    expect(order).toEqual(['complete', 'resolved']);
  });
});
