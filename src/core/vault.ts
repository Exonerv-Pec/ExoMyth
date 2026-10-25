import type { FileEntry, Page, VaultSettings, WikiLink } from './types';
import { DEFAULT_SETTINGS } from './types';
import { VaultIndex } from './index';
import { isIgnoredPath, type VaultStorage } from './storage';
import {
  addRelationToText,
  mapWikiLinks,
  parsePage,
  removeRelationFromText,
  renamePlainRelations,
  setPinnedInText,
} from './parse';
import { baseName, dirName, joinPath, normalizeName, sanitizePageName, stripMd } from './names';
import { emptyLayout, parseLayout, serializeLayout, type StoredLayout } from './layout';
import { ATTACHMENTS_DIR, extensionOf } from './media';
import { emptyStats, parseStats, serializeStats, type WritingStats } from './stats';
import { useCalendar, worldCalendar } from './calendar';
import { cleanVersionName, movedVersionPath, pageVersions, versionFile, versionFolder, versionsToThin, AUTO_LIMIT, type PageVersion } from './versions';

export const META_DIR = '.exomyth';
const SETTINGS_PATH = `${META_DIR}/settings.json`;
export const LAYOUT_PATH = `${META_DIR}/graph.json`;
/** Writing stats: words and time per day. */
export const WRITING_PATH = `${META_DIR}/writing.json`;
/** Folder used by versions before the rename to Exomyth. Read as a fallback, never written or deleted. */
const LEGACY_META_DIR = '.mythloom';
const legacy = (path: string) => LEGACY_META_DIR + path.slice(META_DIR.length);
export const TRASH_DIR = '.trash';

type Listener = () => void;

/**
 * A vault: the pages in a storage location plus their link index.
 *
 * Every mutation writes to storage first and then refreshes the index, so what the panel
 * shows is always what is on disk. Operations run one at a time (see `exclusive`): a refresh
 * triggered by the window regaining focus can never interleave with a save or a rename.
 */
export class Vault {
  private pageMap = new Map<string, Page>();
  private files: FileEntry[] = [];
  private listeners = new Set<Listener>();
  private _index: VaultIndex;
  private _settings: VaultSettings = DEFAULT_SETTINGS;
  private queue: Promise<unknown> = Promise.resolve();
  /** Bumped on every change; handy as a reactive dependency. */
  version = 0;

  private constructor(readonly storage: VaultStorage) {
    this._index = new VaultIndex([], DEFAULT_SETTINGS);
  }

  static async open(storage: VaultStorage): Promise<Vault> {
    const v = new Vault(storage);
    await v.refresh();
    return v;
  }

  get index(): VaultIndex {
    return this._index;
  }
  get settings(): VaultSettings {
    return this._settings;
  }
  get pages(): readonly Page[] {
    return this._index.pages;
  }
  /** All files in the vault (notes, images, ...), sorted by path. */
  get allFiles(): readonly FileEntry[] {
    return this.files;
  }

  getPage(path: string): Page | undefined {
    return this.pageMap.get(path);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  private rebuild(): void {
    this._index = new VaultIndex(this.pageMap.values(), this._settings);
    // Dates are read with the world's calendar (a page with `calendar: true`, never a template).
    useCalendar(worldCalendar(this._index.worldPages));
  }

  /** Runs `fn` after every earlier operation has finished. Public methods use it; private `_` methods do not. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /* ------------------------------------------------------------------- loading */

  /** Re-reads changed files from storage. Cheap when nothing changed. */
  refresh(): Promise<void> {
    return this.exclusive(() => this._refresh());
  }

  private async _refresh(): Promise<void> {
    const entries = (await this.storage.list()).filter((e) => !isIgnoredPath(e.path));
    entries.sort((a, b) => (a.path < b.path ? -1 : 1));
    this.files = entries.filter((e) => !e.path.startsWith(`${META_DIR}/`) && !e.path.startsWith(`${LEGACY_META_DIR}/`));

    const seen = new Set<string>();
    const toLoad: FileEntry[] = [];
    for (const e of this.files) {
      if (!e.path.toLowerCase().endsWith('.md')) continue;
      seen.add(e.path);
      const known = this.pageMap.get(e.path);
      if (!known || known.mtime !== e.mtime) toLoad.push(e);
    }
    let changed = toLoad.length > 0;
    for (const path of [...this.pageMap.keys()]) {
      if (!seen.has(path)) {
        this.pageMap.delete(path);
        changed = true;
      }
    }

    // Read in small batches so huge vaults do not open thousands of handles at once.
    for (let i = 0; i < toLoad.length; i += 32) {
      await Promise.all(
        toLoad.slice(i, i + 32).map(async (e) => {
          const text = await this.storage.readText(e.path);
          this.pageMap.set(e.path, parsePage(e.path, text, e.mtime));
        }),
      );
    }

    const settingsPath = entries.some((e) => e.path === SETTINGS_PATH)
      ? SETTINGS_PATH
      : entries.some((e) => e.path === legacy(SETTINGS_PATH))
        ? legacy(SETTINGS_PATH)
        : undefined;
    if (settingsPath) {
      try {
        const parsed = JSON.parse(await this.storage.readText(settingsPath)) as Partial<VaultSettings>;
        const next: VaultSettings = {
          relationTypes: Array.isArray(parsed.relationTypes)
            ? parsed.relationTypes.filter((d) => d && typeof d.id === 'string' && d.id.trim())
            : [],
        };
        if (JSON.stringify(next) !== JSON.stringify(this._settings)) {
          this._settings = next;
          changed = true;
        }
      } catch {
        /* A broken settings file must never prevent the vault from opening. */
      }
    }

    if (changed || this.version === 0) {
      this.rebuild();
      this.emit();
    }
  }

  saveSettings(settings: VaultSettings): Promise<void> {
    return this.exclusive(async () => {
      await this.storage.writeText(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
      this._settings = settings;
      this.rebuild();
      this.emit();
    });
  }

  /* -------------------------------------------------------------- graph layout */

  /** Saved node positions of the relations graph. Missing or broken files give an empty layout. */
  async loadLayout(): Promise<StoredLayout> {
    try {
      for (const path of [LAYOUT_PATH, legacy(LAYOUT_PATH)]) {
        if (await this.storage.exists(path)) return parseLayout(await this.storage.readText(path));
      }
      return emptyLayout();
    } catch {
      return emptyLayout();
    }
  }

  saveLayout(layout: StoredLayout): Promise<void> {
    return this.exclusive(() => this.storage.writeText(LAYOUT_PATH, serializeLayout(layout)));
  }

  /* ------------------------------------------------------------- writing stats */

  /** The world's writing stats. A missing or broken file gives empty stats. */
  async loadStats(): Promise<WritingStats> {
    try {
      if (await this.storage.exists(WRITING_PATH)) return parseStats(await this.storage.readText(WRITING_PATH));
    } catch {
      /* Unreadable: start again from nothing rather than blocking the world. */
    }
    return emptyStats();
  }

  saveStats(stats: WritingStats): Promise<void> {
    return this.exclusive(() => this.storage.writeText(WRITING_PATH, serializeStats(stats)));
  }

  /** Keeps a page's graph position when the page is renamed. */
  private async moveLayoutKey(from: string, to: string): Promise<void> {
    if (!(await this.storage.exists(LAYOUT_PATH)) && !(await this.storage.exists(legacy(LAYOUT_PATH)))) return;
    const layout = await this.loadLayout();
    const pos = layout.nodes[from];
    if (!pos) return;
    delete layout.nodes[from];
    layout.nodes[to] = pos;
    await this.storage.writeText(LAYOUT_PATH, serializeLayout(layout));
  }

  /* --------------------------------------------------------------------- pages */

  async readRaw(path: string): Promise<string> {
    return this.storage.readText(path);
  }

  /** Writes new content for a page and refreshes its index entry. */
  savePage(path: string, content: string): Promise<Page> {
    return this.exclusive(() => this._savePage(path, content));
  }

  private async _savePage(path: string, content: string): Promise<Page> {
    await this.storage.writeText(path, content);
    const entry = await this.storage.stat(path);
    const page = parsePage(path, content, entry?.mtime ?? Date.now());
    this.pageMap.set(path, page);
    if (!this.files.some((f) => f.path === path)) {
      this.files = [...this.files, { path, mtime: page.mtime, size: content.length }].sort((a, b) =>
        a.path < b.path ? -1 : 1,
      );
    }
    this.rebuild();
    this.emit();
    return page;
  }

  /** Returns a path that does not exist yet, e.g. `Arn.md`, `Arn 2.md`. */
  uniquePath(dir: string, name: string): string {
    const clean = sanitizePageName(name) || 'Untitled';
    const taken = new Set(this.files.map((f) => f.path.toLowerCase()));
    let candidate = joinPath(dir, `${clean}.md`);
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = joinPath(dir, `${clean} ${n}.md`);
    return candidate;
  }

  /* ------------------------------------------------------------- attachments */

  /**
   * Finds a non-page file of the world (an image, a video...) from how a page refers to it:
   * a full path, a path ending, or just the file name. Ties go to the shallowest path.
   */
  resolveFile(target: string): FileEntry | undefined {
    const want = target.trim().replace(/^\.?\//, '').normalize('NFC').toLowerCase();
    if (!want) return undefined;
    const matches = this.files.filter((f) => {
      const p = f.path.normalize('NFC').toLowerCase();
      return p === want || p.endsWith('/' + want);
    });
    matches.sort((a, b) => a.path.split('/').length - b.path.split('/').length || (a.path < b.path ? -1 : 1));
    return matches[0];
  }

  readFile(path: string): Promise<Uint8Array> {
    return this.storage.readBytes(path);
  }

  /**
   * Saves a media file into `attachments/` and returns its path. The file name is made unique
   * across the whole world, so `![[name.png]]` always points at this file.
   */
  saveAttachment(fileName: string, data: Uint8Array): Promise<string> {
    return this.exclusive(async () => {
      const ext = extensionOf(fileName);
      const stem = sanitizePageName(ext ? fileName.slice(0, -(ext.length + 1)) : fileName) || 'file';
      const taken = new Set(this.files.map((f) => f.path.slice(f.path.lastIndexOf('/') + 1).toLowerCase()));
      const nameFor = (n: number) => `${stem}${n > 1 ? ' ' + n : ''}${ext ? '.' + ext : ''}`;
      let n = 1;
      while (taken.has(nameFor(n).toLowerCase())) n++;
      const path = joinPath(ATTACHMENTS_DIR, nameFor(n));
      await this.storage.writeBytes(path, data);
      const entry = (await this.storage.stat(path)) ?? { path, mtime: Date.now(), size: data.byteLength };
      this.files = [...this.files, entry].sort((a, b) => (a.path < b.path ? -1 : 1));
      this.emit();
      return path;
    });
  }

  createPage(name: string, dir = '', content?: string): Promise<Page> {
    return this.exclusive(() => {
      const path = this.uniquePath(dir, name);
      return this._savePage(path, content ?? `# ${baseName(path)}\n\n`);
    });
  }

  /**
   * Renames a page and updates every link to it across the vault, including links inside
   * `relations:` and `![[embeds]]`. Links that reach the page through an alias stay as they are.
   */
  renamePage(path: string, newNameRaw: string): Promise<string> {
    return this.exclusive(() => this._renamePage(path, newNameRaw));
  }

  private async _renamePage(path: string, newNameRaw: string): Promise<string> {
    const page = this.pageMap.get(path);
    if (!page) throw new Error(`Page not found: ${path}`);
    const newName = sanitizePageName(newNameRaw);
    if (!newName) throw new Error('Name is empty');
    const newPath = joinPath(dirName(path), `${newName}.md`);
    if (newPath === path) return path;
    const caseOnly = newPath.toLowerCase() === path.toLowerCase();
    if (!caseOnly && this.files.some((f) => f.path.toLowerCase() === newPath.toLowerCase())) {
      throw new Error(`A page named "${newName}" already exists here`);
    }

    const oldIndex = this._index;
    const oldNorm = normalizeName(page.name);
    const oldPathNorm = normalizeName(stripMd(path));
    const pointsHere = (target: string): boolean => {
      const n = normalizeName(stripMd(target));
      const named = n === oldNorm || (n.includes('/') && (oldPathNorm === n || oldPathNorm.endsWith('/' + n)));
      return named && oldIndex.resolve(target)?.path === path;
    };
    const rewrite = (text: string): string => {
      const out = mapWikiLinks(
        text,
        (link) => {
          if (!pointsHere(link.target)) return undefined;
          const slash = link.target.lastIndexOf('/');
          const target = slash === -1 ? newName : link.target.slice(0, slash + 1) + newName;
          return `${target}${link.heading ? '#' + link.heading : ''}${link.alias ? '|' + link.alias : ''}`;
        },
        { embeds: true },
      );
      return renamePlainRelations(out, pointsHere, newName);
    };

    const updates: [string, string][] = [];
    for (const p of this.pageMap.values()) {
      const text = await this.storage.readText(p.path);
      const next = rewrite(text);
      if (next !== text) updates.push([p.path, next]);
    }

    const ownUpdate = updates.find(([p]) => p === path);
    const content = ownUpdate ? ownUpdate[1] : await this.storage.readText(path);
    if (caseOnly) {
      // Case-insensitive disks treat `arn.md` and `Arn.md` as one file, case-sensitive ones as two.
      // Going through a temporary name renames correctly on both, and keeps a copy until the end.
      const temp = joinPath(dirName(path), `${newName}.${Date.now().toString(36)}.renaming`);
      await this.storage.writeText(temp, content);
      await this.storage.remove(path);
      await this.storage.writeText(newPath, content);
      await this.storage.remove(temp);
    } else {
      // Write the new file first, so an interruption can never lose the page itself.
      await this.storage.writeText(newPath, content);
    }
    for (const [p, text] of updates) if (p !== path) await this.storage.writeText(p, text);
    if (!caseOnly) await this.storage.remove(path);
    await this.moveLayoutKey(path, newPath).catch(() => undefined);
    await this.moveVersions(path, newPath).catch(() => undefined);
    await this._refresh();
    return newPath;
  }

  /**
   * Moves a page into another folder ('' for the top of the world), keeping its name. Links by name
   * keep working as they are; links written with a folder path are updated to the new place.
   * Returns the new path.
   */
  movePage(path: string, folder: string): Promise<string> {
    return this.exclusive(() => this._movePage(path, folder));
  }

  private async _movePage(path: string, folderRaw: string): Promise<string> {
    const page = this.pageMap.get(path);
    if (!page) throw new Error(`Page not found: ${path}`);
    const folder = folderRaw
      .replace(/\\/g, '/')
      .split('/')
      .map((s) => sanitizePageName(s))
      .filter(Boolean)
      .join('/');
    const newPath = joinPath(folder, baseName(path) + '.md');
    if (newPath === path) return path;
    if (this.files.some((f) => f.path.toLowerCase() === newPath.toLowerCase())) {
      throw new Error(`A page named "${page.name}" already exists in that folder`);
    }

    // Only links that spell out a folder ([[Characters/Arn]]) need to change.
    const oldIndex = this._index;
    const oldPathNorm = normalizeName(stripMd(path));
    const newTarget = stripMd(newPath);
    const pointsHere = (target: string): boolean => {
      const n = normalizeName(stripMd(target));
      return n.includes('/') && (oldPathNorm === n || oldPathNorm.endsWith('/' + n)) && oldIndex.resolve(target)?.path === path;
    };
    const rewrite = (text: string): string => {
      const out = mapWikiLinks(
        text,
        (link) => (pointsHere(link.target) ? `${newTarget}${link.heading ? '#' + link.heading : ''}${link.alias ? '|' + link.alias : ''}` : undefined),
        { embeds: true },
      );
      return renamePlainRelations(out, pointsHere, newTarget);
    };

    const updates: [string, string][] = [];
    for (const p of this.pageMap.values()) {
      const text = await this.storage.readText(p.path);
      const next = rewrite(text);
      if (next !== text) updates.push([p.path, next]);
    }
    const own = updates.find(([p]) => p === path);
    // Write the new file first, so an interruption can never lose the page itself.
    await this.storage.writeText(newPath, own ? own[1] : await this.storage.readText(path));
    for (const [p, text] of updates) if (p !== path) await this.storage.writeText(p, text);
    await this.storage.remove(path);
    await this.moveLayoutKey(path, newPath).catch(() => undefined);
    await this.moveVersions(path, newPath).catch(() => undefined);
    await this._refresh();
    return newPath;
  }

  /** Every folder that holds pages, plus the folders above them ('' is not included). */
  folders(): string[] {
    const out = new Set<string>();
    for (const f of this.files) {
      if (!f.path.toLowerCase().endsWith('.md')) continue;
      for (let d = dirName(f.path); d; d = dirName(d)) out.add(d);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  /** Moves a page to `.trash/` (kept recoverable; nothing is permanently deleted by the app). */
  trashPage(path: string): Promise<void> {
    return this.exclusive(async () => {
      const content = await this.storage.readText(path);
      let target = `${TRASH_DIR}/${path}`;
      for (let n = 2; await this.storage.exists(target); n++) target = `${TRASH_DIR}/${stripMd(path)} (${n}).md`;
      await this.storage.writeText(target, content);
      await this.storage.remove(path);
      // The page's versions go to the trash with it, so they can come back together.
      await this.moveVersions(path, path, (file) => `${TRASH_DIR}/${file}`).catch(() => undefined);
      await this._refresh();
    });
  }

  /* ------------------------------------------------------------------ versions */

  /** Moves a page's saved versions along with it; `place` can send them somewhere else (the trash). */
  private async moveVersions(from: string, to: string, place = (file: string) => movedVersionPath(file, from, to)): Promise<void> {
    const files = await this.storage.listDir(versionFolder(from));
    for (const f of files) {
      const target = place(f.path);
      if (target === f.path) continue;
      await this.storage.writeBytes(target, await this.storage.readBytes(f.path));
      await this.storage.remove(f.path);
    }
  }

  /** The saved versions of a page, newest first. */
  async versions(pagePath: string): Promise<PageVersion[]> {
    return pageVersions(pagePath, await this.storage.listDir(versionFolder(pagePath)));
  }

  readVersion(file: string): Promise<string> {
    return this.storage.readText(file);
  }

  /**
   * Saves `content` as a version of a page. Versions saved by themselves (no `name`) are then
   * thinned out to `limit`. Returns the new version.
   */
  saveVersion(pagePath: string, content: string, name?: string, time = Date.now(), limit = AUTO_LIMIT): Promise<PageVersion> {
    return this.exclusive(async () => {
      let t = Math.floor(time / 1000) * 1000;
      let file = versionFile(pagePath, t, name);
      // Two versions in the same second: the later one is filed a second on.
      while (await this.storage.exists(file)) file = versionFile(pagePath, (t += 1000), name);
      await this.storage.writeText(file, content);
      const all = await this.versions(pagePath);
      if (!name) for (const v of versionsToThin(all, limit)) await this.storage.remove(v.file).catch(() => undefined);
      return all.find((v) => v.file === file) ?? { file, time: t, size: content.length, ...(name ? { name } : {}) };
    });
  }

  /** Gives a version a name (a named version is kept for good), or takes the name away. */
  renameVersion(version: PageVersion, pagePath: string, name: string): Promise<PageVersion> {
    return this.exclusive(async () => {
      const clean = cleanVersionName(name);
      const file = versionFile(pagePath, version.time, clean || undefined);
      if (file !== version.file) {
        if (await this.storage.exists(file)) throw new Error('A version with this name already exists');
        await this.storage.writeBytes(file, await this.storage.readBytes(version.file));
        await this.storage.remove(version.file);
      }
      const next: PageVersion = { file, time: version.time, size: version.size };
      if (clean) next.name = clean;
      return next;
    });
  }

  deleteVersion(file: string): Promise<void> {
    return this.exclusive(() => this.storage.remove(file));
  }

  /* ----------------------------------------------------------------- relations */

  private editPage(path: string, fn: (text: string) => string): Promise<void> {
    return this.exclusive(async () => {
      const text = await this.storage.readText(path);
      const next = fn(text);
      if (next !== text) await this._savePage(path, next);
    });
  }

  /** Rewrites a page's text with `fn` (for structured edits such as map pins). */
  editText(path: string, fn: (text: string) => string): Promise<void> {
    return this.editPage(path, fn);
  }

  addRelation(path: string, type: string, link: WikiLink): Promise<void> {
    return this.editPage(path, (t) => addRelationToText(t, type.trim(), link));
  }

  removeRelation(path: string, type: string, target: string): Promise<void> {
    return this.editPage(path, (t) => removeRelationFromText(t, type, target));
  }

  /** Pins or unpins `target` in the relations panel of `path`. Names and aliases of one page count as the same pin. */
  togglePin(path: string, target: string): Promise<void> {
    const page = this.pageMap.get(path);
    if (!page) return Promise.resolve();
    const keyOf = (t: string) => this._index.resolve(t)?.path ?? 'missing:' + normalizeName(t);
    const key = keyOf(target);
    const has = page.pinned.some((t) => keyOf(t) === key);
    const next = has ? page.pinned.filter((t) => keyOf(t) !== key) : [...page.pinned, target];
    return this.editPage(path, (t) => setPinnedInText(t, next));
  }
}
