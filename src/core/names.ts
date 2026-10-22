/** Normalises a page name or link target for case-insensitive, whitespace-tolerant matching. */
export function normalizeName(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function stripMd(path: string): string {
  return path.replace(/\.md$/i, '');
}

export function baseName(path: string): string {
  const stem = stripMd(path);
  const i = stem.lastIndexOf('/');
  return i === -1 ? stem : stem.slice(i + 1);
}

export function dirName(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** Characters that cannot appear in a page name (file-system safe, wiki-link safe). */
const FORBIDDEN = /[\\/:*?"<>|#^[\]\n\r]/g;

export function sanitizePageName(name: string): string {
  return name.replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
}

/** Deterministic collator, independent of the user's UI locale. */
export const collator = new Intl.Collator(['ru', 'en'], { sensitivity: 'base', numeric: true });

export function compareText(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}
