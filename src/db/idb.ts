/**
 * IndexedDB open + versioned migrations + promise helpers.
 * Never logs record contents.
 */

export const DB_NAME = 'sugar-daddy';

export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

export const STORES = ['measurements', 'metricConfigs', 'reminders', 'dismissals', 'kv'] as const;
export type StoreName = (typeof STORES)[number];

/** MIGRATIONS[n] upgrades the schema from version n to n + 1. */
export const MIGRATIONS: Migration[] = [
  // v0 → v1: initial schema
  (db) => {
    const measurements = db.createObjectStore('measurements', { keyPath: 'id' });
    measurements.createIndex('by_takenAt', 'takenAt');
    measurements.createIndex('by_metric_takenAt', ['metricId', 'takenAt']);
    db.createObjectStore('metricConfigs', { keyPath: 'metricId' });
    db.createObjectStore('reminders', { keyPath: 'id' });
    const dismissals = db.createObjectStore('dismissals', { keyPath: 'id' });
    dismissals.createIndex('by_reminder', 'reminderId');
    db.createObjectStore('kv', { keyPath: 'key' });
  },
];

export const CURRENT_VERSION = MIGRATIONS.length;

export const MSG_QUOTA = 'Your device is out of storage space. Nothing was saved.';
export const MSG_GENERIC = "Sugar Daddy couldn't save to this device's storage. Nothing was saved.";
export const MSG_BLOCKED = 'Close other Sugar Daddy tabs and try again.';

export class StorageError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

/** Wrap any IndexedDB failure into a StorageError with a user-facing message. */
export function toStorageError(cause: unknown): StorageError {
  if (cause instanceof StorageError) return cause;
  const name = (cause as { name?: unknown } | null)?.name;
  return new StorageError(name === 'QuotaExceededError' ? MSG_QUOTA : MSG_GENERIC, cause);
}

export function openDatabase(
  opts: { name?: string; migrations?: Migration[]; idb?: IDBFactory } = {},
): Promise<IDBDatabase> {
  const name = opts.name ?? DB_NAME;
  const migrations = opts.migrations ?? MIGRATIONS;
  const factory = opts.idb ?? indexedDB;
  return new Promise((resolve, reject) => {
    let settled = false;
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(name, migrations.length);
    } catch (e) {
      reject(toStorageError(e));
      return;
    }
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction;
      if (!tx) return;
      for (const migrate of migrations.slice(ev.oldVersion)) migrate(db, tx);
    };
    req.onblocked = () => {
      settled = true;
      reject(new StorageError(MSG_BLOCKED));
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        // Already rejected as blocked; do not leak the connection.
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      reject(toStorageError(req.error));
    };
  });
}

/** Resolve a request's result (for reads). */
export function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(toStorageError(r.error));
  });
}

/**
 * Run `work` inside one transaction. Resolves with work's return value only after
 * `tx.oncomplete`; rejects with a StorageError on error/abort (or if work throws).
 */
export function transact<T>(
  db: IDBDatabase,
  stores: StoreName | readonly StoreName[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores as string | string[], mode);
    } catch (e) {
      reject(toStorageError(e));
      return;
    }
    let result: T;
    let failed = false;
    const fail = (cause: unknown) => {
      if (failed) return;
      failed = true;
      reject(toStorageError(cause));
    };
    tx.oncomplete = () => {
      if (!failed) resolve(result);
    };
    tx.onerror = (ev) => {
      // Error events bubble from requests; the abort that follows carries the same error.
      ev.preventDefault();
      fail(tx.error ?? (ev.target as IDBRequest | null)?.error);
      try {
        tx.abort();
      } catch {
        /* already aborting */
      }
    };
    tx.onabort = () => fail(tx.error);
    try {
      result = work(tx);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      fail(e);
    }
  });
}
