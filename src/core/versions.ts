/**
 * Saved versions of pages: plain copies of a page's file, kept in the world under
 * `.exomyth/versions/<page path>/`, one Markdown file per version, named by the time it was saved:
 *
 *   .exomyth/versions/Scenes/The Duel.md/2026-10-24 15.30.05.md                  (saved by itself)
 *   .exomyth/versions/Scenes/The Duel.md/2026-10-24 18.02.11 Before the rewrite.md   (named)
 *
 * Versions saved by themselves are thinned out evenly over time, so a page never keeps more than
 * `AUTO_LIMIT` of them; named versions stay until they are deleted. Nothing here touches storage.
 */
import type { FileEntry } from './types';
import { VERSIONS_DIR } from './storage';

export { VERSIONS_DIR };

/** At most this many versions saved by themselves per page. */
export const AUTO_LIMIT = 20;
/** A new version is saved by itself at most this often while a page is being edited. */
export const AUTO_GAP_MS = 30 * 60 * 1000;
/** Longest name of a version, in characters. */
export const NAME_LIMIT = 60;

export interface PageVersion {
  /** Where the version file is. */
  file: string;
  /** Local time it was saved, in milliseconds. */
  time: number;
  /** Given by the writer; versions without one were saved by themselves. */
  name?: string;
  size: number;
}

/** The folder that holds a page's versions. Ends with the page's `.md`, so it never mixes with a folder of the same name. */
export function versionFolder(pagePath: string): string {
  return `${VERSIONS_DIR}/${pagePath}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-10-24 15.30.05`: sorts by time and works in file names everywhere. */
export function stamp(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

/** A name that is safe in a file name on every system. */
export function cleanVersionName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, NAME_LIMIT)
    .trim();
}

export function versionFile(pagePath: string, time: number, name?: string): string {
  const clean = name ? cleanVersionName(name) : '';
  return `${versionFolder(pagePath)}/${stamp(time)}${clean ? ' ' + clean : ''}.md`;
}

const FILE_RE = /^(\d{4})-(\d\d)-(\d\d) (\d\d)\.(\d\d)\.(\d\d)(?: (.+))?\.md$/;

/** Reads a version from its file name; other files in the folder are not versions. */
export function parseVersion(entry: FileEntry): PageVersion | undefined {
  const base = entry.path.slice(entry.path.lastIndexOf('/') + 1);
  const m = FILE_RE.exec(base);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, name] = m;
  const time = new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!).getTime();
  if (!Number.isFinite(time)) return undefined;
  const v: PageVersion = { file: entry.path, time, size: entry.size };
  if (name?.trim()) v.name = name.trim();
  return v;
}

/** The versions of one page among `entries` (the files of its folder), newest first. */
export function pageVersions(pagePath: string, entries: readonly FileEntry[]): PageVersion[] {
  const folder = versionFolder(pagePath) + '/';
  return entries
    .filter((e) => e.path.startsWith(folder) && !e.path.slice(folder.length).includes('/'))
    .map(parseVersion)
    .filter((v): v is PageVersion => !!v)
    .sort((a, b) => b.time - a.time || (a.file < b.file ? 1 : -1));
}

/**
 * Versions saved by themselves that should go so at most `limit` stay. Each step removes the one
 * whose neighbours are closest in time, so what is left is spread evenly over the page's history.
 * The oldest and the newest always stay; named versions never count and are never removed.
 */
export function versionsToThin(versions: readonly PageVersion[], limit = AUTO_LIMIT): PageVersion[] {
  const auto = versions.filter((v) => !v.name).sort((a, b) => a.time - b.time);
  const removed: PageVersion[] = [];
  while (auto.length > Math.max(2, limit)) {
    let best = 1;
    let bestGap = Infinity;
    for (let i = 1; i < auto.length - 1; i++) {
      const gap = auto[i + 1]!.time - auto[i - 1]!.time;
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    removed.push(...auto.splice(best, 1));
  }
  return removed;
}

/** Whether to save a version by itself now: the last one is old enough (or there is none). */
export function dueForVersion(lastTime: number | undefined, now: number, gap = AUTO_GAP_MS): boolean {
  return lastTime === undefined || now - lastTime >= gap;
}

/** Moves a versions path along with its page (rename or move). */
export function movedVersionPath(file: string, fromPage: string, toPage: string): string {
  const from = versionFolder(fromPage) + '/';
  return file.startsWith(from) ? versionFolder(toPage) + '/' + file.slice(from.length) : file;
}

/** Total size of versions, for showing how much room they take. */
export function versionsSize(versions: readonly PageVersion[]): number {
  return versions.reduce((n, v) => n + v.size, 0);
}
