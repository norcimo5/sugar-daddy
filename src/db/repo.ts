/**
 * Repository over the Sugar Daddy IndexedDB schema.
 * Every write resolves only after its transaction completes.
 */
import {
  DEFAULT_SETTINGS,
  type AppSnapshot,
  type Dismissal,
  type Measurement,
  type MetricConfig,
  type MetricRegistry,
  type Reminder,
  type Settings,
} from '../domain/types';
import { STORES, transact } from './idb';

export interface MeasurementQuery {
  metricId?: string;
  /** Inclusive. */
  from?: Date;
  /** Exclusive. */
  to?: Date;
}

export interface Repo {
  listMeasurements(q?: MeasurementQuery): Promise<Measurement[]>;
  putMeasurement(m: Measurement): Promise<void>;
  deleteMeasurement(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  listMetricConfigs(): Promise<MetricConfig[]>;
  saveMetricConfig(c: MetricConfig): Promise<void>;
  listReminders(): Promise<Reminder[]>;
  putReminder(r: Reminder): Promise<void>;
  deleteReminder(id: string): Promise<void>;
  listDismissals(): Promise<Dismissal[]>;
  putDismissal(d: Dismissal): Promise<void>;
  snapshot(): Promise<AppSnapshot>;
  applySnapshot(s: AppSnapshot, mode: 'merge' | 'replace'): Promise<void>;
}

const SETTINGS_KEY = 'settings';

interface KvRecord<T> {
  key: string;
  value: T;
}

function byTakenAtDesc(a: Measurement, b: Measurement): number {
  if (a.takenAt !== b.takenAt) return a.takenAt < b.takenAt ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function measurementRange(q: MeasurementQuery): { index: string; range: IDBKeyRange | null } {
  const from = q.from?.toISOString();
  const to = q.to?.toISOString();
  if (q.metricId !== undefined) {
    // Arrays sort after strings, so [id, []] is above every [id, <iso string>].
    const lower = [q.metricId, from ?? ''];
    const upper = to !== undefined ? [q.metricId, to] : [q.metricId, []];
    return { index: 'by_metric_takenAt', range: IDBKeyRange.bound(lower, upper, false, true) };
  }
  let range: IDBKeyRange | null = null;
  if (from !== undefined && to !== undefined) range = IDBKeyRange.bound(from, to, false, true);
  else if (from !== undefined) range = IDBKeyRange.lowerBound(from);
  else if (to !== undefined) range = IDBKeyRange.upperBound(to, true);
  return { index: 'by_takenAt', range };
}

function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export function createRepo(db: IDBDatabase, registry: MetricRegistry): Repo {
  const put = (store: (typeof STORES)[number], value: unknown) =>
    transact(db, store, 'readwrite', (tx) => {
      tx.objectStore(store).put(value);
    });

  const getAll = <T>(store: (typeof STORES)[number]) =>
    transact(db, store, 'readonly', (tx) => tx.objectStore(store).getAll()).then(
      (r) => r.result as T[],
    );

  const readSettings = (tx: IDBTransaction) =>
    tx.objectStore('kv').get(SETTINGS_KEY) as IDBRequest<KvRecord<Partial<Settings>> | undefined>;

  return {
    async listMeasurements(q = {}) {
      const { index, range } = measurementRange(q);
      const r = await transact(db, 'measurements', 'readonly', (tx) =>
        tx.objectStore('measurements').index(index).getAll(range),
      );
      return (r.result as Measurement[]).sort(byTakenAtDesc);
    },

    putMeasurement: (m) => put('measurements', m),

    deleteMeasurement: (id) =>
      transact(db, 'measurements', 'readwrite', (tx) => {
        tx.objectStore('measurements').delete(id);
      }),

    async getSettings() {
      const r = await transact(db, 'kv', 'readonly', readSettings);
      return mergeSettings(r.result?.value);
    },

    saveSettings: (s) => put('kv', { key: SETTINGS_KEY, value: s } satisfies KvRecord<Settings>),

    async listMetricConfigs() {
      const stored = await getAll<MetricConfig>('metricConfigs');
      const byId = new Map(stored.map((c) => [c.metricId, c]));
      const now = new Date().toISOString();
      const defs = [...registry.all()].sort((a, b) => a.order - b.order);
      const out: MetricConfig[] = defs.map(
        (def) =>
          byId.get(def.id) ?? {
            metricId: def.id,
            enabled: def.defaultEnabled,
            unit: def.defaultUnit,
            thresholds: {},
            createdAt: now,
            updatedAt: now,
          },
      );
      const known = new Set(defs.map((d) => d.id));
      const extras = stored
        .filter((c) => !known.has(c.metricId))
        .sort((a, b) => (a.metricId < b.metricId ? -1 : a.metricId > b.metricId ? 1 : 0));
      return [...out, ...extras];
    },

    saveMetricConfig: (c) => put('metricConfigs', c),

    listReminders: () => getAll<Reminder>('reminders'),

    putReminder: (r) => put('reminders', r),

    deleteReminder: (id) =>
      transact(db, ['reminders', 'dismissals'], 'readwrite', (tx) => {
        tx.objectStore('reminders').delete(id);
        const dismissals = tx.objectStore('dismissals');
        const keysReq = dismissals.index('by_reminder').getAllKeys(id);
        keysReq.onsuccess = () => {
          for (const key of keysReq.result) dismissals.delete(key);
        };
      }),

    listDismissals: () => getAll<Dismissal>('dismissals'),

    putDismissal: (d) => put('dismissals', d),

    async snapshot() {
      const reqs = await transact(db, STORES, 'readonly', (tx) => ({
        settings: readSettings(tx),
        metricConfigs: tx.objectStore('metricConfigs').getAll(),
        reminders: tx.objectStore('reminders').getAll(),
        dismissals: tx.objectStore('dismissals').getAll(),
        measurements: tx.objectStore('measurements').getAll(),
      }));
      return {
        settings: mergeSettings(reqs.settings.result?.value),
        metricConfigs: reqs.metricConfigs.result as MetricConfig[],
        reminders: reqs.reminders.result as Reminder[],
        dismissals: reqs.dismissals.result as Dismissal[],
        measurements: (reqs.measurements.result as Measurement[]).sort(byTakenAtDesc),
      };
    },

    applySnapshot: (s, mode) =>
      transact(db, STORES, 'readwrite', (tx) => {
        if (mode === 'replace') for (const name of STORES) tx.objectStore(name).clear();
        tx.objectStore('kv').put({ key: SETTINGS_KEY, value: s.settings });
        const configs = tx.objectStore('metricConfigs');
        for (const c of s.metricConfigs) configs.put(c);
        const reminders = tx.objectStore('reminders');
        for (const r of s.reminders) reminders.put(r);
        const dismissals = tx.objectStore('dismissals');
        for (const d of s.dismissals) dismissals.put(d);
        const measurements = tx.objectStore('measurements');
        for (const m of s.measurements) measurements.put(m);
      }),
  };
}
