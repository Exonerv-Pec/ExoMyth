import type { FileEntry } from './types';

/**
 * Where a vault lives. All paths are relative to the vault root and use forward slashes.
 * Implementations never talk to the network: a vault is a folder on this device.
 */
export interface VaultStorage {
  readonly kind: 'folder' | 'browser' | 'memory';
  /** Human readable name (folder name or browser vault name). */
  readonly label: string;
  list(): Promise<FileEntry[]>;
  /** Metadata for one file, or undefined when it does not exist. Cheap compared to `list`. */
  stat(path: string): Promise<FileEntry | undefined>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/** Folders that are never scanned (tooling, trash, version control). */
const IGNORED_DIRS = new Set(['.git', '.trash', 'node_modules', '.obsidian', '.DS_Store']);

export function isIgnoredPath(path: string): boolean {
  return path.split('/').some((seg) => IGNORED_DIRS.has(seg));
}

/* --------------------------------------------------------------------- memory */

export class MemoryStorage implements VaultStorage {
  readonly kind = 'memory' as const;
  private files = new Map<string, { data: Uint8Array; mtime: number }>();
  private clock = 1;

  constructor(
    readonly label = 'Memory',
    initial: Record<string, string> = {},
  ) {
    const enc = new TextEncoder();
    for (const [p, t] of Object.entries(initial)) this.files.set(p, { data: enc.encode(t), mtime: this.clock++ });
  }

  async list(): Promise<FileEntry[]> {
    return [...this.files.entries()].map(([path, f]) => ({ path, mtime: f.mtime, size: f.data.byteLength }));
  }
  async stat(path: string): Promise<FileEntry | undefined> {
    const f = this.files.get(path);
    return f ? { path, mtime: f.mtime, size: f.data.byteLength } : undefined;
  }
  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readBytes(path));
  }
  async writeText(path: string, content: string): Promise<void> {
    await this.writeBytes(path, new TextEncoder().encode(content));
  }
  async readBytes(path: string): Promise<Uint8Array> {
    const f = this.files.get(path);
    if (!f) throw new Error(`File not found: ${path}`);
    return f.data;
  }
  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, { data, mtime: this.clock++ });
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

/* ----------------------------------------------------- File System Access (folder) */

export class FolderStorage implements VaultStorage {
  readonly kind = 'folder' as const;
  readonly label: string;

  constructor(readonly root: FileSystemDirectoryHandle) {
    this.label = root.name;
  }

  async list(): Promise<FileEntry[]> {
    const out: FileEntry[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, handle] of dir.entries()) {
        if (IGNORED_DIRS.has(name)) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === 'directory') {
          await walk(handle as FileSystemDirectoryHandle, path);
        } else {
          const file = await (handle as FileSystemFileHandle).getFile();
          out.push({ path, mtime: file.lastModified, size: file.size });
        }
      }
    };
    await walk(this.root, '');
    return out;
  }

  private async dirFor(path: string, create: boolean): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error(`Invalid path: ${path}`);
    let dir = this.root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return { dir, name };
  }

  private async fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const { dir, name } = await this.dirFor(path, create);
    return dir.getFileHandle(name, { create });
  }

  async stat(path: string): Promise<FileEntry | undefined> {
    try {
      const file = await (await this.fileHandle(path, false)).getFile();
      return { path, mtime: file.lastModified, size: file.size };
    } catch {
      return undefined;
    }
  }
  async readText(path: string): Promise<string> {
    return (await (await this.fileHandle(path, false)).getFile()).text();
  }
  async readBytes(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await (await this.fileHandle(path, false)).getFile()).arrayBuffer());
  }
  async writeText(path: string, content: string): Promise<void> {
    // The browser writes to a temporary swap file and swaps it in on close(),
    // so a crash mid-write cannot leave a half-written note behind.
    const w = await (await this.fileHandle(path, true)).createWritable();
    await w.write(content);
    await w.close();
  }
  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const w = await (await this.fileHandle(path, true)).createWritable();
    await w.write(data as unknown as BufferSource);
    await w.close();
  }
  async remove(path: string): Promise<void> {
    const { dir, name } = await this.dirFor(path, false);
    await dir.removeEntry(name);
  }
  async exists(path: string): Promise<boolean> {
    try {
      await this.fileHandle(path, false);
      return true;
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------ IndexedDB (browser) */

interface IdbRecord {
  path: string;
  data: ArrayBuffer;
  mtime: number;
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`exomyth-vault:${name}`, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'path' });
    req.onsuccess = () => {
      // Let another tab (or a delete) take over the database instead of being blocked by this one.
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Browser-local vault for browsers without folder access (Firefox, Safari). Never leaves this browser profile. */
export class BrowserStorage implements VaultStorage {
  readonly kind = 'browser' as const;
  private dbPromise: Promise<IDBDatabase>;

  constructor(readonly label: string) {
    this.dbPromise = openDb(label);
    // Failures surface when the storage is first used; avoid an "unhandled rejection" warning meanwhile.
    this.dbPromise.catch(() => undefined);
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.dbPromise).transaction('files', mode).objectStore('files');
  }

  async list(): Promise<FileEntry[]> {
    const all = (await wrap((await this.store('readonly')).getAll())) as IdbRecord[];
    return all.map((r) => ({ path: r.path, mtime: r.mtime, size: r.data.byteLength }));
  }
  async stat(path: string): Promise<FileEntry | undefined> {
    const rec = (await wrap((await this.store('readonly')).get(path))) as IdbRecord | undefined;
    return rec ? { path, mtime: rec.mtime, size: rec.data.byteLength } : undefined;
  }
  async readBytes(path: string): Promise<Uint8Array> {
    const rec = (await wrap((await this.store('readonly')).get(path))) as IdbRecord | undefined;
    if (!rec) throw new Error(`File not found: ${path}`);
    return new Uint8Array(rec.data);
  }
  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readBytes(path));
  }
  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const copy = data.slice().buffer as ArrayBuffer;
    await wrap((await this.store('readwrite')).put({ path, data: copy, mtime: Date.now() } satisfies IdbRecord));
  }
  async writeText(path: string, content: string): Promise<void> {
    await this.writeBytes(path, new TextEncoder().encode(content));
  }
  async remove(path: string): Promise<void> {
    await wrap((await this.store('readwrite')).delete(path));
  }
  async exists(path: string): Promise<boolean> {
    return (await wrap((await this.store('readonly')).count(path))) > 0;
  }
}

/** Permanently erases a browser-stored world. Worlds kept in folders are never touched. */
export function deleteBrowserVault(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(`exomyth-vault:${name}`);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Lists the names of browser vaults previously created on this device. */
export async function listBrowserVaults(): Promise<string[]> {
  const dbs = (await indexedDB.databases?.()) ?? [];
  return dbs
    .map((d) => d.name ?? '')
    .filter((n) => n.startsWith('exomyth-vault:'))
    .map((n) => n.slice('exomyth-vault:'.length))
    .sort();
}
