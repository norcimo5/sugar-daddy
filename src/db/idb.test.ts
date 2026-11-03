import { IDBFactory } from 'fake-indexeddb';
import {
  CURRENT_VERSION,
  DB_NAME,
  MIGRATIONS,
  StorageError,
  openDatabase,
  type Migration,
} from './idb';

let factory: IDBFactory;
const opened: IDBDatabase[] = [];

beforeEach(() => {
  factory = new IDBFactory();
});

afterEach(() => {
  while (opened.length) opened.pop()?.close();
});

const [migrateV1] = MIGRATIONS as [Migration];

async function open(opts: { name?: string; migrations?: Migration[] } = {}) {
  const db = await openDatabase({ ...opts, idb: factory });
  opened.push(db);
  return db;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

describe('constants', () => {
  it('exposes the DB name and current version', () => {
    expect(DB_NAME).toBe('sugar-daddy');
    expect(CURRENT_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(CURRENT_VERSION);
  });
});

describe('openDatabase (v0 → v1)', () => {
  it('creates all stores with keyPaths and indexes', async () => {
    const db = await open();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(1);
    expect([...db.objectStoreNames].sort()).toEqual(
      ['dismissals', 'kv', 'measurements', 'metricConfigs', 'reminders'].sort(),
    );
    const tx = db.transaction(
      ['measurements', 'metricConfigs', 'reminders', 'dismissals', 'kv'],
      'readonly',
    );
    const m = tx.objectStore('measurements');
    expect(m.keyPath).toBe('id');
    expect([...m.indexNames].sort()).toEqual(['by_metric_takenAt', 'by_takenAt']);
    expect(m.index('by_takenAt').keyPath).toBe('takenAt');
    expect(m.index('by_metric_takenAt').keyPath).toEqual(['metricId', 'takenAt']);
    expect(tx.objectStore('metricConfigs').keyPath).toBe('metricId');
    expect(tx.objectStore('reminders').keyPath).toBe('id');
    const d = tx.objectStore('dismissals');
    expect(d.keyPath).toBe('id');
    expect(d.index('by_reminder').keyPath).toBe('reminderId');
    expect(tx.objectStore('kv').keyPath).toBe('key');
  });

  it('honours a custom name', async () => {
    const db = await open({ name: 'custom-name' });
    expect(db.name).toBe('custom-name');
  });

  it('reopening at the same version keeps data', async () => {
    const db1 = await open({ name: 'reopen' });
    const tx = db1.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ key: 'x', value: 1 });
    await new Promise((r) => (tx.oncomplete = r));
    db1.close();
    const db2 = await open({ name: 'reopen' });
    const v = await req(db2.transaction('kv').objectStore('kv').get('x'));
    expect(v).toEqual({ key: 'x', value: 1 });
  });
});

describe('openDatabase migrations (v1 → v2 test fixture)', () => {
  it('preserves data and applies the new migration exactly once', async () => {
    const name = 'migrate-v2';
    const db1 = await open({ name });
    const tx = db1.transaction('measurements', 'readwrite');
    tx.objectStore('measurements').put({
      id: 'm1',
      metricId: 'glucose',
      takenAt: '2026-01-01T12:00:00.000Z',
      value: { value: 100 },
    });
    await new Promise((r) => (tx.oncomplete = r));
    db1.close();

    let v2Runs = 0;
    const v1Spy = vi.fn(migrateV1);
    // Test-only v2 migration: adds an index on `source` and backfills `source`.
    const v2: Migration = (_db, upgradeTx) => {
      v2Runs++;
      const store = upgradeTx.objectStore('measurements');
      store.createIndex('by_source', 'source');
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (!c) return;
        c.update({ ...c.value, source: c.value.source ?? 'manual' });
        c.continue();
      };
    };
    const db2 = await open({ name, migrations: [v1Spy, v2] });
    expect(db2.version).toBe(2);
    expect(v1Spy).not.toHaveBeenCalled();
    expect(v2Runs).toBe(1);
    const store = db2.transaction('measurements').objectStore('measurements');
    expect([...store.indexNames]).toContain('by_source');
    const m = await req(store.get('m1'));
    expect(m).toMatchObject({ id: 'm1', metricId: 'glucose', source: 'manual' });
    db2.close();

    const db3 = await open({ name, migrations: [v1Spy, v2] });
    expect(v2Runs).toBe(1);
    expect(db3.version).toBe(2);
  });

  it('runs every migration in order from an empty database', async () => {
    const order: number[] = [];
    const m1: Migration = (db, tx) => {
      order.push(1);
      migrateV1(db, tx);
    };
    const m2: Migration = () => {
      order.push(2);
    };
    const db = await open({ name: 'fresh-v2', migrations: [m1, m2] });
    expect(db.version).toBe(2);
    expect(order).toEqual([1, 2]);
  });
});

describe('openDatabase blocked / versionchange', () => {
  it('closes itself on versionchange so upgrades are not blocked', async () => {
    const name = 'vchange';
    await open({ name });
    const db2 = await open({ name, migrations: [...MIGRATIONS, () => {}] });
    expect(db2.version).toBe(2);
  });

  it('rejects with a friendly StorageError when blocked', async () => {
    const name = 'blocked';
    const db1 = await open({ name });
    db1.onversionchange = null; // simulate a tab that refuses to close
    const p = openDatabase({ name, idb: factory, migrations: [...MIGRATIONS, () => {}] });
    await expect(p).rejects.toBeInstanceOf(StorageError);
    await expect(p).rejects.toThrow('Close other Sugar Daddy tabs and try again.');
  });
});

describe('StorageError', () => {
  it('is an Error with a cause', () => {
    const cause = new Error('x');
    const e = new StorageError('msg', cause);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('StorageError');
    expect(e.message).toBe('msg');
    expect(e.cause).toBe(cause);
  });
});
