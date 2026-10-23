/**
 * Worlds as .zip files: a whole world in one file, for backups, moving to another computer or
 * sending a world to someone. Everything happens on this device; nothing is uploaded.
 *
 * Inside the .zip the world is a folder named after it, so unpacking gives a normal world folder
 * that Exomyth (or any Markdown editor) can open.
 */
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { isIgnoredPath, type VaultStorage } from './storage';

/** Files that are already compressed: stored as they are, which is faster and no bigger. */
const PACKED = /\.(png|jpe?g|gif|webp|avif|mp4|m4v|webm|mov|mp3|m4a|aac|ogg|oga|opus|flac|zip|gz|pdf)$/i;

/** Limits for opening a .zip, so a broken or hostile file cannot fill the browser's storage. */
export const ZIP_LIMITS = { files: 20000, bytes: 1024 * 1024 * 1024 };

/** Leftovers of other systems' archivers that are not part of a world. */
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;

/** A file name that is safe as a .zip folder name (and as a world name). */
export function zipFolderName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return clean || 'World';
}

// The .zip format stores times from 1980 on; older or missing times are left out.
const ZIP_EPOCH = Date.UTC(1980, 0, 2);

/** Packs every file of a world (pages, settings, pictures, sounds) into a .zip. */
export async function worldToZip(storage: VaultStorage, name = storage.label): Promise<{ data: Uint8Array; files: number }> {
  const root = zipFolderName(name);
  const entries = (await storage.list()).filter((f) => !isIgnoredPath(f.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
  const files: Zippable = {};
  for (const entry of entries) {
    const read = await storage.readBytes(entry.path);
    // Bytes from another JavaScript realm (a frame, a test environment) would be taken for a folder.
    const data = read instanceof Uint8Array ? read : new Uint8Array(read);
    const opts: { level: 0 | 6; mtime?: Date } = { level: PACKED.test(entry.path) ? 0 : 6 };
    if (entry.mtime > ZIP_EPOCH) opts.mtime = new Date(entry.mtime);
    files[`${root}/${entry.path}`] = [data, opts];
  }
  return { data: zipSync(files), files: entries.length };
}

/**
 * A path from a .zip as a safe path inside the world, or undefined when it must be skipped:
 * folders, absolute paths, `..`, system leftovers and the folders Exomyth never reads.
 */
export function safeZipPath(raw: string): string | undefined {
  if (raw.endsWith('/') || raw.endsWith('\\')) return undefined;
  const path = raw.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path)) return undefined;
  const parts = path.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..' || /[\u0000-\u001f]/.test(p))) return undefined;
  if (JUNK.test(path) || isIgnoredPath(path)) return undefined;
  return path;
}

export class ZipTooLargeError extends Error {
  constructor() {
    super('The .zip is too large to open');
  }
}

/**
 * Reads the files of a world from a .zip. When everything sits in one folder (as in a .zip that
 * Exomyth made, or a zipped folder), that folder is the world. Unsafe paths are skipped.
 */
export function readWorldZip(data: Uint8Array, limits = ZIP_LIMITS): { files: Map<string, Uint8Array>; skipped: number } {
  let count = 0;
  let total = 0;
  let skipped = 0;
  const unpacked = unzipSync(data, {
    filter: (file) => {
      if (file.name.endsWith('/')) return false;
      if (!safeZipPath(file.name)) {
        skipped++;
        return false;
      }
      count++;
      total += file.originalSize;
      if (count > limits.files || total > limits.bytes) throw new ZipTooLargeError();
      return true;
    },
  });

  const paths = Object.keys(unpacked).map((p) => [p, safeZipPath(p)!] as const);
  // One folder holding everything: unwrap it.
  const first = paths[0]?.[1].split('/')[0];
  const wrapped = !!first && paths.every(([, p]) => p.startsWith(`${first}/`));
  const files = new Map<string, Uint8Array>();
  for (const [raw, path] of paths) {
    files.set(wrapped ? path.slice(first!.length + 1) : path, unpacked[raw]!);
  }
  return { files, skipped };
}

/** The world name a .zip suggests: its file name without the extension. */
export function worldNameFromZip(fileName: string): string {
  return zipFolderName(fileName.replace(/\.zip$/i, ''));
}

/** `name`, or `name (2)`, `name (3)`… — the first one not in `taken`. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLocaleLowerCase()));
  if (!used.has(name.toLocaleLowerCase())) return name;
  for (let i = 2; ; i++) {
    const next = `${name} (${i})`;
    if (!used.has(next.toLocaleLowerCase())) return next;
  }
}
