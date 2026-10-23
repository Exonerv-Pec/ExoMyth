import { Vault } from './core/vault';
import { baseName, dirName, joinPath, sanitizePageName, stripMd } from './core/names';
import { parseLinkText } from './core/parse';
import { emptyLayout, type StoredLayout } from './core/layout';
import { mediaKind } from './core/media';
import { detectLang, translate, type Key, type Lang } from './i18n';

export type ViewMode = 'edit' | 'split' | 'preview' | 'graph';
export type TextMode = Exclude<ViewMode, 'graph'>;

export interface HoverRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A page preview card shown next to a link. */
export interface HoverState {
  target: string;
  heading?: string;
  /** Next to a link: the link's box. In the corner: the box of the area whose corner holds the card. */
  rect: HoverRect;
  /** `corner` pins the card to the top-right of `rect` instead of placing it beside it. */
  placement?: 'anchor' | 'corner';
}
export type Theme = 'auto' | 'light' | 'dark';

export type DialogState =
  | {
      kind: 'prompt';
      title: string;
      label: string;
      value: string;
      confirmLabel: string;
      onSubmit: (value: string) => void | Promise<void>;
    }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      danger?: boolean;
      onConfirm: () => void | Promise<void>;
    };

function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function loadNumber(key: string, fallback: number): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/** File contents as bytes (FileReader fallback for environments without Blob.arrayBuffer). */
function readBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private mode: preferences simply are not remembered. */
  }
}

class App {
  vault = $state.raw<Vault | null>(null);
  /** Bumped whenever the vault changes; read it inside $derived to depend on vault data. */
  version = $state(0);
  current = $state<string | null>(null);
  pendingHeading = $state<string | null>(null);
  mode = $state<ViewMode>(load('exomyth:mode', ['edit', 'split', 'preview', 'graph'], 'split'));
  /** The text mode to return to from the graph. */
  textMode = $state<TextMode>(load('exomyth:textMode', ['edit', 'split', 'preview'], 'split'));
  theme = $state<Theme>(load('exomyth:theme', ['auto', 'light', 'dark'], 'auto'));
  lang = $state<Lang>(detectLang());
  sidebarW = $state(loadNumber('exomyth:sidebarW', 272));
  panelW = $state(loadNumber('exomyth:panelW', 340));
  sidebarOpen = $state(false);
  panelOpen = $state(false);
  dialog = $state<DialogState | null>(null);
  toast = $state<{ text: string; error: boolean } | null>(null);
  /** Collapsed state of panel groups and folders, remembered per world (never per page). */
  collapsed = $state<Record<string, boolean>>({});
  saveStatus = $state<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  hover = $state<HoverState | null>(null);
  /** Saved graph positions of the open world (null while loading). */
  layout = $state.raw<StoredLayout | null>(null);
  /** Asks the graph to bring a page into view; `seq` makes repeated requests distinct. */
  graphFocus = $state<{ path: string; seq: number } | null>(null);

  private unsubscribe: (() => void) | null = null;
  private flushers = new Set<() => Promise<void>>();
  /** Inserts text at the cursor of the open editor (set while an editor is shown). */
  private inserter: ((text: string) => void) | null = null;
  private backStack: string[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private layoutTimer: ReturnType<typeof setTimeout> | undefined;

  /* ----------------------------------------------------------------- i18n/prefs */

  t = (key: Key, ...args: (string | number)[]): string => translate(this.lang, key, ...args);

  setLang(lang: Lang): void {
    this.lang = lang;
    save('exomyth:lang', lang);
  }
  toggleLang(): void {
    this.setLang(this.lang === 'ru' ? 'en' : 'ru');
  }
  cycleTheme(): void {
    this.theme = this.theme === 'auto' ? 'light' : this.theme === 'light' ? 'dark' : 'auto';
    save('exomyth:theme', this.theme);
  }
  setMode(mode: ViewMode): void {
    this.hoverClose();
    this.mode = mode;
    save('exomyth:mode', mode);
    if (mode !== 'graph') {
      this.textMode = mode;
      save('exomyth:textMode', mode);
    }
  }

  /** Switches to the graph and brings `path` into view. */
  showOnGraph(path: string | null): void {
    void this.flush().then(() => {
      this.setMode('graph');
      if (path) this.graphFocus = { path, seq: (this.graphFocus?.seq ?? 0) + 1 };
    });
  }
  setSidebarW(w: number): void {
    this.sidebarW = Math.min(480, Math.max(200, Math.round(w)));
    save('exomyth:sidebarW', String(this.sidebarW));
  }
  setPanelW(w: number): void {
    this.panelW = Math.min(560, Math.max(260, Math.round(w)));
    save('exomyth:panelW', String(this.panelW));
  }

  notify(text: string, error = false): void {
    this.toast = { text, error };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), error ? 6000 : 2600);
  }

  /* ------------------------------------------------------------------- vault */

  private prefKey(name: string): string {
    return `exomyth:${this.vault?.storage.kind}:${this.vault?.storage.label}:${name}`;
  }

  setVault(vault: Vault): void {
    this.unsubscribe?.();
    this.vault = vault;
    this.version = vault.version;
    this.unsubscribe = vault.subscribe(() => (this.version = vault.version));
    this.backStack = [];
    this.saveStatus = 'saved';
    try {
      this.collapsed = JSON.parse(read(this.prefKey('collapsed')) ?? '{}') as Record<string, boolean>;
    } catch {
      this.collapsed = {};
    }
    this.layout = null;
    void vault.loadLayout().then((l) => {
      if (this.vault === vault) this.layout = l;
    });
    const last = read(this.prefKey('last'));
    const first =
      (last && vault.getPage(last) ? last : undefined) ??
      vault.pages.find((p) => p.name === 'Добро пожаловать' || p.name === 'Welcome')?.path ??
      vault.pages[0]?.path ??
      null;
    this.current = first;
  }

  closeVault(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.vault = null;
    this.current = null;
    this.layout = null;
    this.hoverClose();
    this.flushers.clear();
  }

  /** Per-world preference stored in this browser (view position of the graph, etc.). */
  worldPref(name: string): string | null {
    return read(this.prefKey(name));
  }
  setWorldPref(name: string, value: string): void {
    save(this.prefKey(name), value);
  }

  /* ------------------------------------------------------------ graph layout */

  /** Replaces the saved graph layout and writes it to the world shortly after (merging rapid changes). */
  setLayout(layout: StoredLayout, immediate = false): void {
    this.layout = layout;
    const vault = this.vault;
    if (!vault) return;
    clearTimeout(this.layoutTimer);
    const write = () => void vault.saveLayout(layout).catch((e: unknown) => this.fail(e));
    if (immediate) write();
    else this.layoutTimer = setTimeout(write, 500);
  }

  resetLayout(): void {
    this.setLayout(emptyLayout(), true);
  }

  /* ------------------------------------------------------------ hover cards */

  /** Shows a preview for `target` after a short pause. `anchor` gives the link's position at that moment. */
  hoverStart(
    target: string,
    heading: string | undefined,
    anchor: () => HoverRect | undefined,
    placement: 'anchor' | 'corner' = 'anchor',
  ): void {
    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    const delay = this.hover ? 140 : 420;
    this.showTimer = setTimeout(() => {
      const rect = anchor();
      if (!rect) return;
      const next: HoverState = { target, rect };
      if (heading) next.heading = heading;
      if (placement === 'corner') next.placement = 'corner';
      this.hover = next;
    }, delay);
  }

  /** Hides the preview after a short grace period, so the pointer can travel into the card. */
  hoverEnd(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    // A card in the corner is further from the pointer, so it waits a little longer.
    this.hideTimer = setTimeout(() => (this.hover = null), this.hover?.placement === 'corner' ? 700 : 260);
  }

  hoverKeep(): void {
    clearTimeout(this.hideTimer);
  }

  hoverClose(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.hover = null;
  }

  toggleCollapsed(key: string): void {
    this.collapsed = { ...this.collapsed, [key]: !this.collapsed[key] };
    save(this.prefKey('collapsed'), JSON.stringify(this.collapsed));
  }

  /* --------------------------------------------------------- unsaved edit flush */

  registerInserter(fn: (text: string) => void): () => void {
    this.inserter = fn;
    return () => {
      if (this.inserter === fn) this.inserter = null;
    };
  }

  get canInsert(): boolean {
    return this.mode === 'edit' || this.mode === 'split';
  }

  /* -------------------------------------------------------------- media files */

  /**
   * Saves image, video and audio files into the world's `attachments/` folder and returns the
   * Markdown that embeds them (one `![[file]]` per line). Unsupported files are skipped with a note.
   */
  async addMedia(files: File[]): Promise<string> {
    const vault = this.vault;
    if (!vault) return '';
    const lines: string[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      let name = file.name || 'file';
      // Screenshots pasted from the clipboard all arrive as "image.png": give them a readable, unique name.
      if (/^image\.(png|jpe?g|gif|webp)$/i.test(name)) {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        name = `screenshot ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.${name.split('.').pop()}`;
      }
      if (!mediaKind(name)) {
        const fromType = /^(image|video|audio)\/([a-z0-9]+)/i.exec(file.type);
        if (fromType && mediaKind(`x.${fromType[2]}`)) name = `${name}.${fromType[2]}`;
      }
      if (!mediaKind(name)) {
        skipped.push(file.name);
        continue;
      }
      try {
        const bytes = await readBytes(file);
        const path = await vault.saveAttachment(name, bytes);
        lines.push(`![[${path.slice(path.lastIndexOf('/') + 1)}]]`);
      } catch (e) {
        this.fail(e);
      }
    }
    if (skipped.length) this.notify(this.t('media.unsupported', skipped.join(', ')), true);
    else if (lines.length) this.notify(this.t('media.saved', lines.length));
    return lines.join('\n');
  }

  /** Adds media files and inserts their embeds at the editor's cursor. */
  async insertMedia(files: File[]): Promise<void> {
    const text = await this.addMedia(files);
    if (text) this.inserter?.(text);
  }

  registerFlusher(fn: () => Promise<void>): () => void {
    this.flushers.add(fn);
    return () => this.flushers.delete(fn);
  }

  /** Writes any pending editor changes to disk. Call before operations that read files. */
  async flush(): Promise<void> {
    await Promise.all([...this.flushers].map((f) => f()));
  }

  /* -------------------------------------------------------------- navigation */

  /**
   * Makes `path` the current page. In the graph this selects the page (and the graph keeps
   * its view); in the text modes it opens the page.
   */
  async open(path: string, heading?: string): Promise<void> {
    await this.flush();
    this.hoverClose();
    if (this.current && this.current !== path) this.backStack.push(this.current);
    this.current = path;
    this.pendingHeading = heading ?? null;
    this.sidebarOpen = false;
    this.panelOpen = false;
    if (this.mode === 'graph') this.graphFocus = { path, seq: (this.graphFocus?.seq ?? 0) + 1 };
    if (this.vault) save(this.prefKey('last'), path);
  }

  /** Opens `path` for reading or editing, leaving the graph if needed. */
  async openText(path: string, heading?: string): Promise<void> {
    if (this.mode === 'graph') this.setMode(this.textMode);
    await this.open(path, heading);
  }

  get canGoBack(): boolean {
    return this.backStack.length > 0;
  }

  async back(): Promise<void> {
    await this.flush();
    while (this.backStack.length > 0) {
      const prev = this.backStack.pop()!;
      if (this.vault?.getPage(prev)) {
        this.current = prev;
        if (this.vault) save(this.prefKey('last'), prev);
        return;
      }
    }
  }

  /** Opens the page a link points to; offers to create it when it does not exist. */
  async openTarget(target: string, heading?: string): Promise<void> {
    const vault = this.vault;
    if (!vault) return;
    const page = vault.index.resolve(target);
    if (page) return this.open(page.path, heading);
    this.confirmCreate(target);
  }

  confirmCreate(target: string, dir = ''): void {
    this.dialog = {
      kind: 'confirm',
      title: this.t('dialog.create'),
      message: this.t('dialog.createMissing', target),
      confirmLabel: this.t('dialog.create'),
      onConfirm: async () => {
        await this.createPage(target, dir);
      },
    };
  }

  /* ---------------------------------------------------------------- mutations */

  /** Creates a page. `name` may include folders: `Places/Rivertown`. */
  async createPage(name: string, dir = ''): Promise<string | undefined> {
    const vault = this.vault;
    if (!vault) return undefined;
    try {
      await this.flush();
      let folder = dir;
      let pageName = name.trim();
      const slash = pageName.lastIndexOf('/');
      if (slash !== -1) {
        folder = joinPath(dir, pageName.slice(0, slash).split('/').map(sanitizePageName).filter(Boolean).join('/'));
        pageName = pageName.slice(slash + 1);
      }
      if (!sanitizePageName(pageName)) return undefined;
      const page = await vault.createPage(pageName, folder);
      this.notify(this.t('toast.created', page.title));
      await this.open(page.path);
      return page.path;
    } catch (e) {
      this.fail(e);
      return undefined;
    }
  }

  async renamePage(path: string, newName: string): Promise<void> {
    const vault = this.vault;
    if (!vault) return;
    try {
      await this.flush();
      const newPath = await vault.renamePage(path, newName);
      if (this.current === path) this.current = newPath;
      this.backStack = this.backStack.map((p) => (p === path ? newPath : p));
      this.notify(this.t('toast.renamed'));
    } catch (e) {
      this.fail(e);
    }
  }

  async trashPage(path: string): Promise<void> {
    const vault = this.vault;
    if (!vault) return;
    try {
      await this.flush();
      await vault.trashPage(path);
      if (this.current === path) {
        this.backStack = this.backStack.filter((p) => p !== path && vault.getPage(p));
        this.current = this.backStack.pop() ?? vault.pages[0]?.path ?? null;
      }
      this.notify(this.t('toast.trashed'));
    } catch (e) {
      this.fail(e);
    }
  }

  async addRelation(path: string, type: string, target: string, createIfMissing: boolean): Promise<boolean> {
    const vault = this.vault;
    if (!vault) return false;
    try {
      await this.flush();
      // Accept "Name", "[[Name]]", "Name|shown text" and "Name#Section".
      const link = parseLinkText(target.trim().replace(/^\[\[|\]\]$/g, ''));
      if (!link.target) return false;
      if (createIfMissing && !vault.index.resolve(link.target)) {
        const name = sanitizePageName(link.target);
        if (name) await vault.createPage(name, dirName(path));
      }
      await vault.addRelation(path, type, link);
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    }
  }

  async removeRelation(path: string, type: string, target: string): Promise<void> {
    try {
      await this.flush();
      await this.vault?.removeRelation(path, type, target);
    } catch (e) {
      this.fail(e);
    }
  }

  async togglePin(path: string, target: string): Promise<void> {
    try {
      await this.flush();
      await this.vault?.togglePin(path, target);
    } catch (e) {
      this.fail(e);
    }
  }

  fail(e: unknown): void {
    this.notify(this.t('toast.error', e instanceof Error ? e.message : String(e)), true);
  }

  /* ------------------------------------------------------------------ dialogs */

  askNewPage(dir = ''): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('dialog.newPage'),
      label: this.t('dialog.newPage.label'),
      value: '',
      confirmLabel: this.t('dialog.create'),
      onSubmit: (v) => void this.createPage(v, dir),
    };
  }

  askRename(path: string): void {
    const name = baseName(path);
    this.dialog = {
      kind: 'prompt',
      title: this.t('dialog.rename'),
      label: this.t('dialog.rename.label'),
      value: name,
      confirmLabel: this.t('dialog.confirm'),
      onSubmit: (v) => void this.renamePage(path, v),
    };
  }

  askTrash(path: string): void {
    this.dialog = {
      kind: 'confirm',
      title: this.t('dialog.delete'),
      message: this.t('dialog.delete.text', stripMd(path)),
      confirmLabel: this.t('dialog.delete.confirm'),
      danger: true,
      onConfirm: () => this.trashPage(path),
    };
  }
}

export const app = new App();
