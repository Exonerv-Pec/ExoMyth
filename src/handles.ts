/**
 * Remembers folders the user opened, so they can be reopened with one click.
 * Only the folder handle (a permission token) is stored — never file contents — and it
 * stays in this browser's IndexedDB. The browser asks for permission again when needed.
 */
export interface SavedFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  lastOpened: number;
}

const DB_NAME = 'exomyth-folders';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('folders', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listFolders(): Promise<SavedFolder[]> {
  try {
    const db = await open();
    const all = (await wrap(db.transaction('folders').objectStore('folders').getAll())) as SavedFolder[];
    return all.sort((a, b) => b.lastOpened - a.lastOpened);
  } catch {
    return [];
  }
}

/** Saves (or refreshes) a folder, reusing the entry when the same folder was opened before. */
export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const existing = await listFolders();
    let id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    for (const f of existing) {
      if (await f.handle.isSameEntry(handle)) {
        id = f.id;
        break;
      }
    }
    const db = await open();
    const rec: SavedFolder = { id, name: handle.name, handle, lastOpened: Date.now() };
    await wrap(db.transaction('folders', 'readwrite').objectStore('folders').put(rec));
  } catch {
    /* Remembering is a convenience; failing must never block opening a world. */
  }
}

export async function forgetFolder(id: string): Promise<void> {
  const db = await open();
  await wrap(db.transaction('folders', 'readwrite').objectStore('folders').delete(id));
}

/** Returns true when read/write access is (or has just been) granted. Must be called from a click. */
export async function ensureReadWrite(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  return (await handle.requestPermission?.(opts)) === 'granted';
}
