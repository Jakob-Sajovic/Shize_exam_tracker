/** Minimal promise wrapper over IndexedDB — one object store, no dependency. */

const DB_NAME = "ukc-shize-2025";
const DB_VERSION = 1;
export const STORE_SESSIONS = "sessions";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: "sessionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB ni na voljo."));
    req.onblocked = () => reject(new Error("Baza je zaklenjena v drugem zavihku."));
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Napaka pri dostopu do lokalne baze."));
  });
}

export async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  await promisify(tx.objectStore(store).put(value));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Zapis prekinjen (morda je zmanjkalo prostora)."));
  });
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return promisify<T>(db.transaction(store, "readonly").objectStore(store).get(key) as IDBRequest<T>);
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return promisify<T[]>(db.transaction(store, "readonly").objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openDb();
  await promisify(db.transaction(store, "readwrite").objectStore(store).delete(key));
}

/** Asks the browser not to evict this origin's data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not fatal — the app works either way */
  }
  return false;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  } catch {
    return null;
  }
}
