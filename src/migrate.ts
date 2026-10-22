/**
 * One-time carry-over from the project's earlier name (Mythloom) to Exomyth.
 * Copies browser preferences, browser-stored worlds and remembered folders to the new
 * names, then removes the old copies. Safe to run on every start: it only acts on what is left.
 * Worlds kept in folders need nothing here; the vault reads their old `.mythloom/` files.
 */

const OLD = 'mythloom';
const NEW = 'exomyth';

export function migrateLocalStorage(storage: Storage = localStorage): number {
  let moved = 0;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(`${OLD}:`)) keys.push(k);
  }
  for (const k of keys) {
    const next = NEW + k.slice(OLD.length);
    const value = storage.getItem(k);
    if (value !== null && storage.getItem(next) === null) {
      storage.setItem(next, value);
      moved++;
    }
    storage.removeItem(k);
  }
  return moved;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb(name: string, store: string, keyPath: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(store, { keyPath });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Copies every record of `store` from database `from` to database `to` (skipping keys that exist), then deletes `from`. */
async function moveDatabase(from: string, to: string, store: string, keyPath: string): Promise<void> {
  const src = await openDb(from, store, keyPath);
  const records = src.objectStoreNames.contains(store)
    ? ((await req(src.transaction(store).objectStore(store).getAll())) as Record<string, unknown>[])
    : [];
  src.close();
  const dst = await openDb(to, store, keyPath);
  const tx = dst.transaction(store, 'readwrite');
  const out = tx.objectStore(store);
  for (const rec of records) {
    if ((await req(out.count(rec[keyPath] as IDBValidKey))) === 0) out.put(rec);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  dst.close();
  await req(indexedDB.deleteDatabase(from));
}

export async function migrateBrowserData(): Promise<void> {
  try {
    migrateLocalStorage();
  } catch {
    /* Storage blocked: nothing was saved under the old name either. */
  }
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return;
  try {
    const names = (await indexedDB.databases()).map((d) => d.name ?? '');
    for (const name of names) {
      if (name.startsWith(`${OLD}-vault:`)) {
        await moveDatabase(name, NEW + name.slice(OLD.length), 'files', 'path');
      } else if (name === `${OLD}-folders`) {
        await moveDatabase(name, `${NEW}-folders`, 'folders', 'id');
      }
    }
  } catch {
    /* Leave old data in place; it is retried on the next start. */
  }
}
