import { Vault } from './core/vault';
import { baseName, dirName, joinPath, sanitizePageName, stripMd } from './core/names';
import { parseLinkText } from './core/parse';
import { emptyLayout, type StoredLayout } from './core/layout';
import { mediaKind } from './core/media';
import { addPin, changePin, removePin, type PinData } from './core/maps';
import { existsIn, pageYears, setYearsInText, worldYearSpan } from './core/years';
import { worldToZip, zipFolderName } from './core/archive';
import { appendIdea } from './core/writing';
import { applyTemplate, builtInTemplateFiles, type TemplateChoice } from './core/templates';
import { detectLang, translate, type Key, type Lang } from './i18n';

export type ViewMode = 'edit' | 'split' | 'preview' | 'graph' | 'cards' | 'timeline';
export type TextMode = Exclude<ViewMode, 'graph' | 'cards' | 'timeline'>;
/** Views of the whole world rather than of one page's text. */
export const WORLD_MODES: readonly ViewMode[] = ['graph', 'cards', 'timeline'];

/**
 * Parts of the app that can be turned off in the settings, for people who do not use them.
 * Everything is on unless switched off; the choice is kept in this browser.
 */
export const FEATURES = [
  'graph',
  'cards',
  'timeline',
  'family',
  'maps',
  'years',
  'relationsPanel',
  'hoverPreviews',
  'wordCount',
  'quickNotes',
  'focusMode',
] as const;
export type Feature = (typeof FEATURES)[number];

function loadFeatures(): Record<Feature, boolean> {
  const out = Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>;
  try {
    const saved = JSON.parse(localStorage.getItem('exomyth:features') ?? '{}') as Record<string, unknown>;
    for (const f of FEATURES) if (saved[f] === false) out[f] = false;
  } catch {
    /* Nothing saved, or storage is blocked: everything stays on. */
  }
  return out;
}

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
      /** A text area (Ctrl+Enter confirms) instead of a one-line field. */
      multiline?: boolean;
      /** A short note under the field. */
      hint?: string;
      /** Values offered while typing (for example existing folders). */
      suggestions?: string[];
      /** An empty value is a valid answer (for example "the top of the world"). */
      allowEmpty?: boolean;
      onSubmit: (value: string) => void | Promise<void>;
    }
  | {
      kind: 'newPage';
      title: string;
      /** A line above the fields, e.g. that a linked page does not exist yet. */
      message?: string;
      name: string;
      folder: string;
      /** The folder was chosen on purpose (a folder's "+"), so templates do not change it. */
      lockFolder: boolean;
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
export function readBytes(file: Blob): Promise<Uint8Array> {
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
  mode = $state<ViewMode>(
    ((m: ViewMode): ViewMode => (loadFeatures()[m as Feature] === false ? 'split' : m))(
      load<ViewMode>('exomyth:mode', ['edit', 'split', 'preview', 'graph', 'cards', 'timeline'], 'split'),
    ),
  );
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
  /** The list of keyboard shortcuts is open. */
  shortcutsOpen = $state(false);
  /** The settings window is open. */
  settingsOpen = $state(false);
  /** Which parts of the app are switched on. */
  features = $state<Record<Feature, boolean>>(loadFeatures());
  /** Focus mode: only the text being written is shown. */
  focus = $state(false);
  /** The browser's spell checker underlines words in the editor. */
  spellcheck = $state(read('exomyth:spellcheck') !== '0');
  private modeBeforeFocus: ViewMode | null = null;
  /** Saved graph positions of the open world (null while loading). */
  layout = $state.raw<StoredLayout | null>(null);
  /** Asks the graph to bring a page into view; `seq` makes repeated requests distinct. */
  graphFocus = $state<{ path: string; seq: number } | null>(null);
  /** Which page view the Cards mode shows: the dossier or the family tree. */
  cardsTab = $state<'dossier' | 'family'>('dossier');
  /** Asks the timeline to bring a page into view. */
  timelineFocus = $state<{ path: string; seq: number } | null>(null);
  /** "Show by year": the graph, cards, maps and timeline show the world as it was in `year`. */
  byYear = $state(false);
  year = $state(0);

  /** Earliest and latest year of the open world (pages and map pins), if any. */
  yearSpan = $derived.by(() => {
    this.version;
    return this.vault ? worldYearSpan(this.vault.index.worldPages) : undefined;
  });

  /** Pages that do not exist in the chosen year (null when not showing by year). */
  outOfTime = $derived.by(() => {
    this.version;
    if (!this.byYear || !this.vault || !this.on('years')) return null;
    const out = new Set<string>();
    for (const p of this.vault.pages) if (!existsIn(pageYears(p), this.year)) out.add(p.path);
    return out;
  });

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
  setTheme(theme: Theme): void {
    this.theme = theme;
    save('exomyth:theme', theme);
  }
  cycleTheme(): void {
    this.theme = this.theme === 'auto' ? 'light' : this.theme === 'light' ? 'dark' : 'auto';
    save('exomyth:theme', this.theme);
  }
  setMode(mode: ViewMode): void {
    this.hoverClose();
    this.mode = mode;
    save('exomyth:mode', mode);
    if (!WORLD_MODES.includes(mode)) {
      this.textMode = mode as TextMode;
      save('exomyth:textMode', mode);
    }
  }

  /** Whether a part of the app is switched on. */
  on(feature: Feature): boolean {
    return this.features[feature] !== false;
  }

  /** Whether a view can be chosen (the world views can be switched off). */
  modeOn(mode: ViewMode): boolean {
    return mode === 'graph' ? this.on('graph') : mode === 'cards' ? this.on('cards') : mode === 'timeline' ? this.on('timeline') : true;
  }

  setFeature(feature: Feature, on: boolean): void {
    this.features = { ...this.features, [feature]: on };
    const off = Object.fromEntries(FEATURES.filter((f) => !this.features[f]).map((f) => [f, false]));
    save('exomyth:features', JSON.stringify(off));
    this.applyFeatures();
  }

  /** Back to everything switched on. */
  resetFeatures(): void {
    this.features = Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>;
    save('exomyth:features', '{}');
  }

  /** Leaves whatever was just switched off. */
  private applyFeatures(): void {
    if (!this.modeOn(this.mode)) this.setMode(this.textMode);
    if (!this.on('years') && this.byYear) this.byYear = false;
    if (!this.on('focusMode') && this.focus) this.setFocus(false);
    if (!this.on('relationsPanel')) this.panelOpen = false;
    if (!this.on('family')) this.cardsTab = 'dossier';
    if (!this.on('hoverPreviews')) this.hoverClose();
  }

  /** Turns focus mode on or off. It shows the editor alone; leaving it restores the view from before. */
  setFocus(on: boolean): void {
    if (on === this.focus) return;
    if (on) {
      if (!this.vault || !this.current) return;
      this.hoverClose();
      this.modeBeforeFocus = this.mode;
      if (this.mode !== 'edit') this.setMode('edit');
      this.sidebarOpen = false;
      this.panelOpen = false;
    } else if (this.modeBeforeFocus) {
      this.setMode(this.modeBeforeFocus);
      this.modeBeforeFocus = null;
    }
    this.focus = on;
  }

  toggleSpellcheck(): void {
    this.spellcheck = !this.spellcheck;
    save('exomyth:spellcheck', this.spellcheck ? '1' : '0');
  }

  /** Switches to the graph and brings `path` into view. */
  showOnGraph(path: string | null): void {
    void this.flush().then(() => {
      this.setMode('graph');
      if (path) this.graphFocus = { path, seq: (this.graphFocus?.seq ?? 0) + 1 };
    });
  }
  /** Shows the family tree of `path` (in the Cards mode). */
  showFamily(path: string): void {
    void this.flush().then(async () => {
      this.cardsTab = 'family';
      this.setMode('cards');
      await this.open(path);
    });
  }

  /** Switches to the timeline and brings `path` into view. */
  showOnTimeline(path: string | null): void {
    void this.flush().then(() => {
      this.setMode('timeline');
      if (path) this.timelineFocus = { path, seq: (this.timelineFocus?.seq ?? 0) + 1 };
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
    if (vault.storage.kind === 'browser') void this.keepStorage();
    this.byYear = read(this.prefKey('byYear')) === '1';
    const y = Number(read(this.prefKey('year')));
    this.year = Number.isFinite(y) ? Math.trunc(y) : 0;
    if (this.byYear) this.clampYear();
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
    this.focus = false;
    this.modeBeforeFocus = null;
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

  /* ------------------------------------------------------- the world as a file */

  /**
   * Asks the browser not to clear its stored worlds when the disk runs low. Browsers decide
   * themselves (some grant it at once, some only for installed or often-used sites).
   */
  private async keepStorage(): Promise<void> {
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted?.())) await navigator.storage.persist();
    } catch {
      /* Not supported: nothing to do. */
    }
  }

  /** Saves the whole open world as a .zip file to the device's downloads. */
  async downloadWorld(): Promise<void> {
    const vault = this.vault;
    if (!vault) return;
    try {
      await this.flush();
      const { data, files } = await worldToZip(vault.storage);
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipFolderName(vault.storage.label)}.zip`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.notify(this.t('zip.saved', files));
    } catch (e) {
      this.fail(e);
    }
  }

  /* ------------------------------------------------------------- ideas inbox */

  askIdea(): void {
    if (!this.vault) return;
    this.dialog = {
      kind: 'prompt',
      title: this.t('inbox.title'),
      label: this.t('inbox.label'),
      value: '',
      multiline: true,
      hint: this.t('inbox.hint', this.t('inbox.page')),
      confirmLabel: this.t('inbox.save'),
      onSubmit: (v) => void this.addIdea(v),
    };
  }

  /** Adds a dated idea to the world's inbox page, creating the page the first time. */
  async addIdea(text: string): Promise<string | undefined> {
    const vault = this.vault;
    if (!vault || !text.trim()) return undefined;
    try {
      await this.flush();
      const name = this.t('inbox.page');
      let page = vault.index.resolve(name) ?? vault.index.resolve('Inbox') ?? vault.index.resolve('Идеи');
      page ??= await vault.createPage(name, '', `# ${name}\n\n${this.t('inbox.intro')}\n`);
      await vault.editText(page.path, (t) => appendIdea(t, text, new Date()));
      this.notify(this.t('inbox.saved', page.title));
      return page.path;
    } catch (e) {
      this.fail(e);
      return undefined;
    }
  }

  /* ------------------------------------------------------------------- years */

  setByYear(on: boolean): void {
    this.byYear = on;
    if (on) this.clampYear();
    save(this.prefKey('byYear'), on ? '1' : '0');
  }

  setYear(year: number): void {
    if (!Number.isFinite(year)) return;
    this.year = Math.trunc(year);
    save(this.prefKey('year'), String(this.year));
  }

  /** Keeps the chosen year inside the world's years (starting at the earliest). */
  private clampYear(): void {
    const span = this.yearSpan;
    if (span && (this.year < span.min || this.year > span.max)) this.setYear(span.min);
  }

  /** Writes the years of a page into its header (undefined ends are removed). */
  async setPageYears(path: string, span: { from?: number; to?: number }): Promise<boolean> {
    const vault = this.vault;
    if (!vault) return false;
    try {
      await this.flush();
      await vault.editText(path, (t) => setYearsInText(t, span));
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    }
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
    if (!this.on('hoverPreviews')) return;
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
    if (this.mode === 'timeline') this.timelineFocus = { path, seq: (this.timelineFocus?.seq ?? 0) + 1 };
    if (this.vault) save(this.prefKey('last'), path);
  }

  /** Opens `path` for reading or editing, leaving the graph if needed. */
  async openText(path: string, heading?: string): Promise<void> {
    if (WORLD_MODES.includes(this.mode)) this.setMode(this.textMode);
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

  /** Offers to create a page a link points to, with the usual choice of template and folder. */
  confirmCreate(target: string, dir = ''): void {
    this.dialog = {
      kind: 'newPage',
      title: this.t('dialog.create'),
      message: this.t('dialog.createMissing', target),
      name: target,
      folder: dir,
      lockFolder: false,
    };
  }

  /* ---------------------------------------------------------------- mutations */

  /**
   * Creates a page. `name` may include folders: `Places/Rivertown`. With a template, the page
   * starts as a copy of it, with `{{title}}` and `{{date}}` filled in.
   */
  async createPage(name: string, dir = '', template?: TemplateChoice): Promise<string | undefined> {
    const vault = this.vault;
    if (!vault) return undefined;
    try {
      await this.flush();
      const clean = (path: string) => path.replace(/\\/g, '/').split('/').map(sanitizePageName).filter(Boolean).join('/');
      let folder = clean(dir);
      let pageName = name.trim();
      const slash = pageName.lastIndexOf('/');
      if (slash !== -1) {
        folder = joinPath(folder, clean(pageName.slice(0, slash)));
        pageName = pageName.slice(slash + 1);
      }
      const title = sanitizePageName(pageName);
      if (!title) return undefined;
      const content = template ? applyTemplate(template.text, { title }) : undefined;
      const page = await vault.createPage(pageName, folder, content);
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

  /** Moves a page into `folder` ('' = the top of the world), keeping links to it working. */
  async movePage(path: string, folder: string): Promise<void> {
    const vault = this.vault;
    if (!vault) return;
    try {
      await this.flush();
      const newPath = await vault.movePage(path, folder);
      if (newPath === path) return;
      if (this.current === path) {
        this.current = newPath;
        save(this.prefKey('last'), newPath);
      }
      this.backStack = this.backStack.map((p) => (p === path ? newPath : p));
      const where = dirName(newPath);
      this.notify(where ? this.t('toast.moved', where) : this.t('toast.movedRoot'));
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

  /* ------------------------------------------------------------- map pins */

  private async editMap(path: string, fn: (text: string) => string): Promise<boolean> {
    const vault = this.vault;
    if (!vault) return false;
    try {
      await this.flush();
      await vault.editText(path, fn);
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    }
  }

  addPin(path: string, pin: PinData): Promise<boolean> {
    return this.editMap(path, (t) => addPin(t, pin));
  }

  changePin(path: string, index: number, patch: Partial<PinData>): Promise<boolean> {
    return this.editMap(path, (t) => changePin(t, index, patch));
  }

  removePin(path: string, index: number): Promise<boolean> {
    return this.editMap(path, (t) => removePin(t, index));
  }

  fail(e: unknown): void {
    this.notify(this.t('toast.error', e instanceof Error ? e.message : String(e)), true);
  }

  /* ------------------------------------------------------------------ dialogs */

  askNewPage(dir = ''): void {
    this.dialog = { kind: 'newPage', title: this.t('dialog.newPage'), name: '', folder: dir, lockFolder: dir !== '' };
  }

  /**
   * Copies the built-in templates into the world's own templates folder, so they can be changed
   * like any page (and new ones added next to them). Opens the first one.
   */
  async addTemplatesToWorld(): Promise<void> {
    const vault = this.vault;
    if (!vault) return;
    try {
      await this.flush();
      let first: string | undefined;
      for (const f of builtInTemplateFiles(this.lang)) {
        if (vault.getPage(f.path)) continue;
        const page = await vault.createPage(baseName(f.path), dirName(f.path), f.text);
        first ??= page.path;
      }
      this.notify(this.t('templates.added', dirName(builtInTemplateFiles(this.lang)[0]!.path)));
      if (first) await this.openText(first);
    } catch (e) {
      this.fail(e);
    }
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

  askMove(path: string): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('dialog.move', baseName(path)),
      label: this.t('dialog.move.label'),
      value: dirName(path),
      hint: this.t('dialog.move.hint'),
      suggestions: this.vault?.folders() ?? [],
      confirmLabel: this.t('dialog.move.confirm'),
      allowEmpty: true,
      onSubmit: (v) => void this.movePage(path, v),
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
