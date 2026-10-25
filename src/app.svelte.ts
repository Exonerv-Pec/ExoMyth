import { Vault } from './core/vault';
import { baseName, dirName, joinPath, sanitizePageName, stripMd } from './core/names';
import { editFrontmatter, parseLinkText } from './core/parse';
import { emptyLayout, type StoredLayout } from './core/layout';
import { mediaKind } from './core/media';
import { addPin, addRegion, changePin, changeRegion, removePin, removeRegion, type PinData, type RegionData } from './core/maps';
import { existsIn, pageYears, setYearsInText, worldYearSpan } from './core/years';
import { worldToZip, zipFolderName } from './core/archive';
import { appendIdea } from './core/writing';
import { addSeconds, addWords, cleanGoal, dayKey, emptyStats, IDLE_SECONDS, mergeStats, setGoal, type WritingStats } from './core/stats';
import { applyTemplate, builtInTemplateFiles, builtInTemplates, worldTemplates, type TemplateChoice } from './core/templates';
import { profileById, starterFiles, type ProfileId } from './core/profiles';
import { projectFiles, projectName } from './core/project';
import { addItem, boardOf, changeItem, itemCount, nextSpot, NOTE_TINTS, removeItem, splitQuote, type BoardData } from './core/board';
import {
  acceptChange,
  addComment,
  addReply,
  editReply,
  findPassage,
  addNote,
  changeNote,
  clearDoneNotes,
  editComment,
  rejectChange,
  removeNote,
  resolveComment,
  setNoteDone,
  settleAll,
  type CriticMark,
} from './core/critic';
import { dueForVersion, type PageVersion } from './core/versions';
import type { GuideTry } from './core/guide';
import { TOUR_KEY } from './core/tour';
import { music } from './music.svelte';
import {
  addChapterToText,
  addSceneToText,
  bookMarkdown,
  moveChapterInText,
  moveSceneInText,
  parseBook,
  removeSceneFromText,
  renameChapterInText,
  type SceneStatus,
} from './core/manuscript';
import { detectLang, formatTime, translate, type Key, type Lang } from './i18n';

export type ViewMode = 'edit' | 'split' | 'preview' | 'graph' | 'cards' | 'timeline' | 'book';
export type TextMode = Exclude<ViewMode, 'graph' | 'cards' | 'timeline' | 'book'>;
/** Views of the whole world rather than of one page's text. */
export const WORLD_MODES: readonly ViewMode[] = ['graph', 'cards', 'timeline', 'book'];

/**
 * Parts of the app that can be turned off in the settings, for people who do not use them.
 * Everything is on unless switched off; the choice is kept in this browser.
 */
export const FEATURES = [
  'graph',
  'cards',
  'timeline',
  'manuscript',
  'family',
  'maps',
  'years',
  'relationsPanel',
  'hoverPreviews',
  'wordCount',
  'quickNotes',
  'focusMode',
  'typewriter',
  'quickLookup',
  'playlists',
  'writingStats',
  'storyProjects',
  'storyStructures',
  'moodBoards',
  'revision',
  'versions',
  'musicKeepsPlaying',
] as const;
export type Feature = (typeof FEATURES)[number];

/**
 * Which parts are on: for one world (`key` is that world's preference key), or else the browser-wide
 * choice. Worlds keep their own, because a novel and a campaign need different parts.
 */
function loadFeatures(key = 'exomyth:features'): Record<Feature, boolean> {
  const out = Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>;
  try {
    const raw = localStorage.getItem(key) ?? (key === 'exomyth:features' ? null : localStorage.getItem('exomyth:features'));
    const saved = JSON.parse(raw ?? '{}') as Record<string, unknown>;
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

/** What the open editor lets the rest of the app do with its text. */
export interface EditorApi {
  path: string;
  /** The selected range (equal ends: the cursor). */
  selection(): { from: number; to: number };
  /** Changes the text with `fn` as one step the writer can undo; it is saved like typing. */
  apply(fn: (text: string) => string): void;
  /** Selects a range and scrolls it into view. */
  reveal(from: number, to: number): void;
}

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
    ((m: ViewMode): ViewMode => (loadFeatures()[(m === 'book' ? 'manuscript' : m) as Feature] === false ? 'split' : m))(
      load<ViewMode>('exomyth:mode', ['edit', 'split', 'preview', 'graph', 'cards', 'timeline', 'book'], 'split'),
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
  /** The quick look-up (search over the current view, with a preview) is open. */
  lookupOpen = $state(false);
  /** The writing stats window is open. */
  statsOpen = $state(false);
  /** Words and time per day of the open world (kept in the world, in `.exomyth/writing.json`). */
  stats = $state.raw<WritingStats>(emptyStats());
  /** The browser's spell checker underlines words in the editor. */
  spellcheck = $state(read('exomyth:spellcheck') !== '0');
  private modeBeforeFocus: ViewMode | null = null;
  /** Saved graph positions of the open world (null while loading). */
  layout = $state.raw<StoredLayout | null>(null);
  /** Asks the graph to bring a page into view; `seq` makes repeated requests distinct. */
  graphFocus = $state<{ path: string; seq: number } | null>(null);
  /** The book shown in the Book mode (path of its page), remembered per world. */
  bookPath = $state<string | null>(null);
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
  private editor: EditorApi | null = null;
  /** The page whose text is open in the editor, if any. */
  editorPath = $state<string | null>(null);
  /** The editing panel (comments, notes, versions) is shown instead of the relations panel. */
  revisionOpen = $state(false);
  /** The step of the first-run tour on screen, or null. */
  tourStep = $state<number | null>(null);
  /** The guide window, and the topic it shows (null: the list, on narrow screens). */
  guideOpen = $state(false);
  guideTopic = $state<string | null>(null);
  /** Typing in the editor is written as suggested changes ({++added++}, {--removed--}). Kept per world. */
  suggesting = $state(false);
  /** A comment clicked in the reading view, to point out in the editing panel. */
  revisionFocus = $state<{ n: number; seq: number } | null>(null);
  /** Versions being compared: `to` null is the page's current text. */
  compare = $state<{ path: string; from: string; to: string | null } | null>(null);
  /** Bumped whenever versions of a page are saved, renamed or deleted, so lists load again. */
  versionsSeq = $state(0);
  /** Per page: when its last version was saved (or found), so most saves need no look at the disk. */
  private versionSeen = new Map<string, number>();
  /** Pages whose next save should not count as written words (a restored version). */
  private uncounted = new Set<string>();
  private backStack: string[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private layoutTimer: ReturnType<typeof setTimeout> | undefined;
  private statsTimer: ReturnType<typeof setTimeout> | undefined;
  /** Stats changed since they were last written to the world. */
  private statsDirty = false;
  /** When a key was last typed in the editor, to time the writing between keystrokes. */
  private lastTyped = 0;

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
    if (mode === 'book') return this.on('manuscript');
    return mode === 'graph' ? this.on('graph') : mode === 'cards' ? this.on('cards') : mode === 'timeline' ? this.on('timeline') : true;
  }

  /** Where the parts that are on are remembered: per world while one is open. */
  private featuresKey(): string {
    return this.vault ? this.prefKey('features') : 'exomyth:features';
  }

  private saveFeatures(): void {
    const off = Object.fromEntries(FEATURES.filter((f) => !this.features[f]).map((f) => [f, false]));
    save(this.featuresKey(), JSON.stringify(off));
  }

  setFeature(feature: Feature, on: boolean): void {
    this.features = { ...this.features, [feature]: on };
    this.saveFeatures();
    this.applyFeatures();
  }

  /** Back to everything switched on. */
  resetFeatures(): void {
    this.features = Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>;
    this.saveFeatures();
  }

  /* ---------------------------------------------------------------- profiles */

  /** The "What are you making?" window: for a new world (with starting pages) or from Settings. */
  profilePicker = $state<'new' | 'settings' | null>(null);
  /** The profile last applied to the open world. */
  profile = $state<ProfileId | null>(null);

  /**
   * Applies a profile: its parts on, the others off, and (for a new world) its starting pages.
   * Pages that already exist are never overwritten.
   */
  async applyProfile(id: ProfileId, starter: boolean): Promise<void> {
    const p = profileById(id);
    if (!p) return;
    this.features = Object.fromEntries(FEATURES.map((f) => [f, !p.off.includes(f)])) as Record<Feature, boolean>;
    this.saveFeatures();
    this.profile = id;
    if (this.vault) save(this.prefKey('profile'), id);
    this.applyFeatures();
    this.profilePicker = null;
    const vault = this.vault;
    if (!starter || !vault) return;
    try {
      let first: string | undefined;
      for (const f of starterFiles(id, this.lang, vault.storage.label)) {
        if (vault.getPage(f.path) || (await vault.storage.exists(f.path))) continue;
        const page = await vault.createPage(baseName(f.path), dirName(f.path), f.text);
        if (/^(Start here|С чего начать)$/.test(page.name)) first = page.path;
        else first ??= page.path;
      }
      if (first) {
        this.current = first;
        save(this.prefKey('last'), first);
      }
      if (id === 'writer') {
        const book = vault.index.worldPages.find((pg) => pg.path.startsWith(this.lang === 'ru' ? 'Рукопись/' : 'Manuscript/'));
        if (book) this.setBook(book.path);
      }
    } catch (e) {
      this.fail(e);
    }
  }

  /** Leaves whatever was just switched off. */
  private applyFeatures(): void {
    if (!this.modeOn(this.mode)) this.setMode(this.textMode);
    if (!this.on('years') && this.byYear) this.byYear = false;
    if (!this.on('focusMode') && this.focus) this.setFocus(false);
    if (!this.on('quickLookup')) this.lookupOpen = false;
    if (!this.on('writingStats')) this.statsOpen = false;
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
    this.loadStats(vault);
    if (vault.storage.kind === 'browser') void this.keepStorage();
    this.bookPath = read(this.prefKey('book'));
    this.features = loadFeatures(this.prefKey('features'));
    this.profile = (read(this.prefKey('profile')) as ProfileId | null) ?? null;
    this.suggesting = read(this.prefKey('suggesting')) === '1';
    // A brand new, empty world: ask what it is for.
    this.profilePicker = vault.pages.length === 0 ? 'new' : null;
    if (!this.modeOn(this.mode)) this.mode = this.textMode;
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
    this.profilePicker = null;
    this.features = loadFeatures();
    this.profile = null;
    this.focus = false;
    this.lookupOpen = false;
    this.statsOpen = false;
    clearTimeout(this.statsTimer);
    this.statsDirty = false;
    this.stats = emptyStats();
    this.lastTyped = 0;
    this.modeBeforeFocus = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.vault = null;
    this.current = null;
    this.layout = null;
    this.hoverClose();
    this.flushers.clear();
    this.compare = null;
    this.versionSeen.clear();
    this.suggesting = false;
    this.tourStep = null;
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

  /* ------------------------------------------------------------------- books */

  setBook(path: string | null): void {
    this.bookPath = path;
    if (path) save(this.prefKey('book'), path);
  }

  /** Applies an edit to a book's table of contents. */
  private async editBook(path: string, fn: (text: string) => string): Promise<boolean> {
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

  moveScene(book: string, from: { c: number; s: number }, to: { c: number; s: number }): Promise<boolean> {
    return this.editBook(book, (t) => moveSceneInText(t, from, to));
  }
  moveChapter(book: string, from: number, to: number): Promise<boolean> {
    return this.editBook(book, (t) => moveChapterInText(t, from, to));
  }
  removeScene(book: string, c: number, s: number): Promise<boolean> {
    return this.editBook(book, (t) => removeSceneFromText(t, c, s));
  }

  /** The Scene template: the world's own (named Scene or Сцена), or the built-in one. */
  private sceneTemplate(): TemplateChoice | undefined {
    const own = worldTemplates(this.vault?.pages ?? []).find((t) => /^(scene|сцена)$/i.test(t.name));
    return own ?? builtInTemplates(this.lang).find((t) => /^(scene|сцена)$/i.test(t.name));
  }

  /** Creates a new book page with one empty chapter and shows it. */
  async createBook(title: string): Promise<void> {
    const vault = this.vault;
    const name = sanitizePageName(title);
    if (!vault || !name) return;
    try {
      await this.flush();
      const folder = this.lang === 'ru' ? 'Рукопись' : 'Manuscript';
      const text = `---\nmanuscript: true\n---\n# ${title.trim()}\n\n## ${this.t('book.chapter1')}\n`;
      const page = await vault.createPage(name, folder, text);
      this.setBook(page.path);
      this.notify(this.t('toast.created', page.title));
    } catch (e) {
      this.fail(e);
    }
  }

  /** Writes a new scene page (from the Scene template) and adds it to the end of a chapter. */
  async addSceneToBook(book: string, chapter: number, name: string): Promise<void> {
    const vault = this.vault;
    const title = sanitizePageName(name);
    if (!vault || !title) return;
    try {
      await this.flush();
      const existing = vault.index.resolve(title);
      let target = existing?.name ?? title;
      if (!existing) {
        const tpl = this.sceneTemplate();
        const folder = tpl?.folder ?? (this.lang === 'ru' ? 'Сцены' : 'Scenes');
        const page = await vault.createPage(title, folder, tpl ? applyTemplate(tpl.text, { title }) : undefined);
        target = page.name;
      }
      await vault.editText(book, (t) => addSceneToText(t, chapter, target));
    } catch (e) {
      this.fail(e);
    }
  }

  addChapter(book: string, title: string): Promise<boolean> {
    return this.editBook(book, (t) => addChapterToText(t, title));
  }
  renameChapter(book: string, c: number, title: string): Promise<boolean> {
    return this.editBook(book, (t) => renameChapterInText(t, c, title));
  }

  /** Sets a scene's status in its header, in the words of the interface language. */
  setSceneStatus(path: string, status: SceneStatus): Promise<boolean> {
    const word = this.t(`status.${status}` as Key).toLocaleLowerCase();
    return this.editBook(path, (t) => editFrontmatter(t, (doc) => doc.set('status', word)));
  }

  /** Saves the whole book as one Markdown file. */
  async downloadBook(path: string, sceneTitles: boolean): Promise<void> {
    const vault = this.vault;
    const page = vault?.getPage(path);
    if (!vault || !page) return;
    await this.flush();
    const book = parseBook(page, vault.index);
    const md = bookMarkdown(book, vault.index, { sceneTitles });
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${zipFolderName(book.title)}.md`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  askBook(): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('book.new'),
      label: this.t('book.new.label'),
      value: '',
      confirmLabel: this.t('dialog.create'),
      onSubmit: (v) => void this.createBook(v),
    };
  }

  askScene(book: string, chapter: number): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('book.scene.new'),
      label: this.t('book.scene.label'),
      value: '',
      confirmLabel: this.t('dialog.create'),
      hint: this.t('book.scene.hint'),
      suggestions: (this.vault?.index.worldPages ?? []).map((p) => p.name),
      onSubmit: (v) => void this.addSceneToBook(book, chapter, v),
    };
  }

  askChapter(book: string, c?: number, current = ''): void {
    this.dialog = {
      kind: 'prompt',
      title: c === undefined ? this.t('book.chapter.new') : this.t('book.chapter.rename'),
      label: this.t('book.chapter.label'),
      value: current,
      confirmLabel: c === undefined ? this.t('dialog.create') : this.t('dialog.confirm'),
      onSubmit: (v) => void (c === undefined ? this.addChapter(book, v) : this.renameChapter(book, c, v)),
    };
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
    // After the editors: saving a page is what adds its words to today.
    await this.flushStats();
  }

  /* ------------------------------------------------------------ writing stats */

  /** Reads the world's stats. Anything written while they loaded is added on top. */
  private loadStats(vault: Vault): void {
    clearTimeout(this.statsTimer);
    this.statsDirty = false;
    this.stats = emptyStats();
    this.lastTyped = 0;
    void vault.loadStats().then((saved) => {
      if (this.vault !== vault) return;
      this.stats = this.statsDirty ? mergeStats(saved, this.stats) : saved;
    });
  }

  private touchStats(): void {
    this.statsDirty = true;
    clearTimeout(this.statsTimer);
    this.statsTimer = setTimeout(() => void this.flushStats(), 4000);
  }

  /** Writes changed stats to the world now. */
  async flushStats(): Promise<void> {
    const vault = this.vault;
    if (!vault || !this.statsDirty) return;
    clearTimeout(this.statsTimer);
    this.statsDirty = false;
    try {
      await vault.saveStats(this.stats);
    } catch (e) {
      this.statsDirty = true;
      this.fail(e);
    }
  }

  /** Counts words added to a page when it is saved from the editor. Words taken away never subtract. */
  recordWords(words: number, path?: string): void {
    if (path && this.uncounted.delete(path)) return;
    if (!this.vault || !this.on('writingStats') || !(words > 0)) return;
    this.stats = addWords(this.stats, dayKey(), words);
    this.touchStats();
  }

  /** Counts the time between keystrokes in the editor, unless the pause was long. */
  noteTyping(): void {
    if (!this.vault || !this.on('writingStats')) return;
    const now = Date.now();
    const gap = (now - this.lastTyped) / 1000;
    this.lastTyped = now;
    if (gap > 0 && gap <= IDLE_SECONDS) {
      this.stats = addSeconds(this.stats, dayKey(), gap);
      this.touchStats();
    }
  }

  /** Sets the daily word goal; empty or zero removes it. */
  setGoal(value: unknown): void {
    this.stats = setGoal(this.stats, cleanGoal(value));
    this.touchStats();
  }

  /** Starts the stats again from zero. */
  async clearStats(): Promise<void> {
    this.stats = emptyStats();
    this.statsDirty = true;
    await this.flushStats();
    this.notify(this.t('stats.cleared'));
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
      music.moved(path, newPath);
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
      music.moved(path, newPath);
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
      if (music.path === path) music.stop();
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

  addRegion(path: string, region: RegionData): Promise<boolean> {
    return this.editMap(path, (t) => addRegion(t, region));
  }

  changeRegion(path: string, index: number, patch: Partial<RegionData>): Promise<boolean> {
    return this.editMap(path, (t) => changeRegion(t, index, patch));
  }

  removeRegion(path: string, index: number): Promise<boolean> {
    return this.editMap(path, (t) => removeRegion(t, index));
  }

  /* ------------------------------------------------------------ mood boards */

  addBoardItem(path: string, data: BoardData): Promise<boolean> {
    return this.editMap(path, (t) => addItem(t, data));
  }

  /** Changes one pinned item; `raise` also lifts it on top of the others. */
  changeBoardItem(path: string, index: number, patch: Partial<BoardData>, raise = false): Promise<boolean> {
    return this.editMap(path, (t) => changeItem(t, index, patch, raise));
  }

  removeBoardItem(path: string, index: number): Promise<boolean> {
    return this.editMap(path, (t) => removeItem(t, index));
  }

  /** Saves picture files into the world and pins them on a board, each a step further down and right. */
  async addBoardPictures(path: string, files: File[]): Promise<void> {
    const pictures = files.filter((f) => /^image\//i.test(f.type) || mediaKind(f.name) === 'image');
    if (pictures.length < files.length) this.notify(this.t('media.unsupported', files.filter((f) => !pictures.includes(f)).map((f) => f.name).join(', ')), true);
    if (!pictures.length) return;
    const names = [...(await this.addMedia(pictures)).matchAll(/!\[\[([^\]]+)\]\]/g)].map((m) => m[1]!);
    const page = this.vault?.getPage(path);
    if (!page || !names.length) return;
    const first = itemCount(page);
    await this.editMap(path, (t) => names.reduce((text, image, i) => addItem(text, { kind: 'image', image, w: 0.3, ...nextSpot(first + i) }), t));
  }

  /** Asks for a picture that is already in the world. */
  askBoardPicture(path: string): void {
    const vault = this.vault;
    if (!vault) return;
    const pictures = vault.allFiles.filter((f) => mediaKind(f.path) === 'image').map((f) => f.path.slice(f.path.lastIndexOf('/') + 1));
    this.dialog = {
      kind: 'prompt',
      title: this.t('board.picture.title'),
      label: this.t('board.picture.label'),
      value: '',
      confirmLabel: this.t('board.pin'),
      suggestions: [...new Set(pictures)].sort(),
      onSubmit: (v) => {
        if (!vault.resolveFile(v)) return void this.notify(this.t('board.picture.missing', v), true);
        const page = vault.getPage(path);
        if (page) void this.addBoardItem(path, { kind: 'image', image: v, w: 0.3, ...nextSpot(itemCount(page)) });
      },
    };
  }

  /** Asks for a quote to pin (or new words for one already there). A last line starting with a dash is the source. */
  askBoardQuote(path: string, index?: number, current?: { quote: string; source?: string }): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('board.quote.new'),
      label: this.t('board.quote.label'),
      value: current ? (current.source ? `${current.quote}\n— ${current.source}` : current.quote) : '',
      multiline: true,
      hint: this.t('board.quote.hint'),
      confirmLabel: index === undefined ? this.t('board.pin') : this.t('dialog.confirm'),
      onSubmit: (v) => {
        const { quote, source } = splitQuote(v);
        if (!quote) return;
        if (index !== undefined) return void this.changeBoardItem(path, index, { quote, source });
        const page = this.vault?.getPage(path);
        if (page) void this.addBoardItem(path, { kind: 'quote', quote, ...(source ? { source } : {}), w: 0.3, ...nextSpot(itemCount(page)) });
      },
    };
  }

  /** Asks for the text of a note to pin (or new text for one already there). */
  askBoardNote(path: string, index?: number, current = ''): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('board.note.new'),
      label: this.t('board.note.label'),
      value: current,
      multiline: true,
      confirmLabel: index === undefined ? this.t('board.pin') : this.t('dialog.confirm'),
      onSubmit: async (v) => {
        if (!v.trim()) return;
        if (index !== undefined) return void (await this.changeBoardItem(path, index, { note: v }));
        const page = this.vault?.getPage(path);
        if (!page) return;
        // Notes take the paper colours in turn, starting with the first.
        const notes = boardOf(page)?.items.filter((i) => i.kind === 'note').length ?? 0;
        await this.addBoardItem(path, { kind: 'note', note: v, tint: NOTE_TINTS[notes % NOTE_TINTS.length]!, w: 0.22, ...nextSpot(itemCount(page)) });
      },
    };
  }

  /** Asks for a page to pin as a card. */
  askBoardPage(path: string): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('board.page.new'),
      label: this.t('board.page.label'),
      value: '',
      confirmLabel: this.t('board.pin'),
      suggestions: (this.vault?.index.worldPages ?? []).filter((p) => p.path !== path).map((p) => p.name),
      onSubmit: (v) => {
        const page = this.vault?.getPage(path);
        if (page) void this.addBoardItem(path, { kind: 'page', page: v, w: 0.2, ...nextSpot(itemCount(page)) });
      },
    };
  }

  /** Asks for the line under a picture or a colour; empty removes it. */
  askBoardCaption(path: string, index: number, current = ''): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('board.caption.title'),
      label: this.t('board.caption.label'),
      value: current,
      allowEmpty: true,
      confirmLabel: this.t('dialog.confirm'),
      onSubmit: (v) => void this.changeBoardItem(path, index, { caption: v || undefined }),
    };
  }

  /* ------------------------------------------------------- editing: comments */

  registerEditor(api: EditorApi): () => void {
    this.editor = api;
    this.editorPath = api.path;
    return () => {
      if (this.editor !== api) return;
      this.editor = null;
      this.editorPath = null;
    };
  }

  /**
   * Changes a page's text. When the page is open in the editor the change goes through it (one step
   * to undo, saved like typing, nothing unsaved is overwritten); otherwise straight to the file.
   */
  async changeText(path: string, fn: (text: string) => string): Promise<boolean> {
    const ed = this.editor;
    if (ed && ed.path === path) {
      ed.apply(fn);
      // Saved at once, so lists that read the page (the editing panel) catch up.
      await this.flush();
      return true;
    }
    return this.editMap(path, fn);
  }

  /** Shows a range of the page in the editor. Returns false when the page is not open there. */
  revealInEditor(path: string, from: number, to: number): boolean {
    const ed = this.editor;
    if (!ed || ed.path !== path) return false;
    ed.reveal(from, to);
    return true;
  }

  /** Opens the editing panel (and, on narrow screens, the drawer that holds it), or closes it. */
  toggleRevision(): void {
    const narrow = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 1100px)').matches;
    if (this.revisionOpen && (!narrow || this.panelOpen)) {
      this.revisionOpen = false;
      this.panelOpen = false;
    } else {
      this.revisionOpen = true;
      this.panelOpen = true;
    }
  }

  /** Starts the tour of the interface from its first step. */
  startTour(): void {
    this.guideOpen = false;
    this.settingsOpen = false;
    this.shortcutsOpen = false;
    this.tourStep = 0;
  }

  /** Ends the tour (finished or skipped); it does not start by itself again in this browser. */
  endTour(): void {
    this.tourStep = null;
    save(TOUR_KEY, 'done');
  }

  /** Whether the tour should start by itself: never seen in this browser. */
  get tourDue(): boolean {
    return read(TOUR_KEY) !== 'done';
  }

  /** Opens the guide, at a topic if given. */
  openGuide(topic?: string): void {
    this.shortcutsOpen = false;
    this.settingsOpen = false;
    if (topic) this.guideTopic = topic;
    this.guideOpen = true;
  }

  /** Whether "Try it" of a guide topic can do something in the open world. */
  canTry(action: GuideTry | undefined): boolean {
    const vault = this.vault;
    if (!action || !vault) return false;
    if (action.kind === 'mode') return this.modeOn(action.mode as ViewMode);
    if (action.kind === 'open') return !!vault.getPage(action.path);
    if (action.name === 'focus') return this.on('focusMode') && !!this.current;
    if (action.name === 'family') return this.on('cards') && this.on('family');
    if (action.name === 'lookup') return this.on('quickLookup');
    if (action.name === 'stats') return this.on('writingStats');
    return true;
  }

  /** Does what a guide topic's "Try it" says, closing the guide. */
  async tryGuide(action: GuideTry): Promise<void> {
    if (!this.canTry(action)) return;
    this.guideOpen = false;
    if (action.kind === 'mode') return this.setMode(action.mode as ViewMode);
    if (action.kind === 'open') {
      await this.openText(action.path);
      if (action.panel === 'revision' && !this.revisionOpen) this.toggleRevision();
      return;
    }
    switch (action.name) {
      case 'lookup':
        this.lookupOpen = true;
        break;
      case 'stats':
        this.statsOpen = true;
        break;
      case 'settings':
        this.settingsOpen = true;
        break;
      case 'shortcuts':
        this.shortcutsOpen = true;
        break;
      case 'newPage':
        this.askNewPage();
        break;
      case 'focus':
        if (WORLD_MODES.includes(this.mode)) this.setMode(this.textMode);
        this.setFocus(true);
        break;
      case 'family': {
        const path = this.vault?.getPage('Characters/Kira Vale.md') ? 'Characters/Kira Vale.md' : this.current;
        if (path) this.showFamily(path);
        else this.setMode('cards');
        break;
      }
    }
  }

  /** Turns suggesting changes on or off (Ctrl+Shift+E). */
  setSuggesting(on: boolean): void {
    this.suggesting = on && this.on('revision');
    if (this.vault) this.setWorldPref('suggesting', this.suggesting ? '1' : '');
    this.notify(this.t(this.suggesting ? 'rev.suggest.on' : 'rev.suggest.off'));
  }

  askReply(path: string, mark: CriticMark, raw: string): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('rev.reply.title'),
      label: this.t('rev.reply.label'),
      value: '',
      multiline: true,
      confirmLabel: this.t('rev.reply.confirm'),
      onSubmit: async (v) => {
        if (v.trim()) await this.changeText(path, (text) => addReply(text, mark, raw, v));
      },
    };
  }

  askEditReply(path: string, mark: CriticMark, raw: string, index: number, current: string): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('rev.reply.edit'),
      label: this.t('rev.reply.editLabel'),
      value: current,
      multiline: true,
      allowEmpty: true,
      confirmLabel: this.t('dialog.confirm'),
      onSubmit: async (v) => {
        await this.changeText(path, (text) => editReply(text, mark, raw, index, v));
      },
    };
  }

  /**
   * Asks for a comment on words selected in the reading view. `nth` says which of several places
   * with the same words was selected.
   */
  askCommentOnText(path: string, selected: string, nth: number): void {
    const page = this.vault?.getPage(path);
    if (!page || !this.on('revision')) return;
    const place = findPassage(page.raw, selected, nth);
    if (!place) return void this.notify(this.t('rev.comment.notFound'), true);
    this.dialog = {
      kind: 'prompt',
      title: this.t('rev.comment.title'),
      label: this.t('rev.comment.on', selected.length > 60 ? selected.slice(0, 59).trimEnd() + '…' : selected),
      value: '',
      multiline: true,
      confirmLabel: this.t('rev.comment.confirm'),
      onSubmit: async (v) => {
        if (!v.trim()) return;
        // The page may have changed while the window was open: find the words again.
        await this.changeText(path, (text) => {
          const at = findPassage(text, selected, nth);
          return at ? addComment(text, at.from, at.to, v).text : text;
        });
      },
    };
  }

  /** Asks for a comment on the selection in the editor (or at the cursor). */
  askComment(): void {
    const ed = this.editor;
    const path = this.current;
    if (!this.on('revision')) return;
    if (!ed || !path || ed.path !== path) return void this.notify(this.t('rev.comment.needEditor'));
    const sel = ed.selection();
    this.dialog = {
      kind: 'prompt',
      title: this.t('rev.comment.title'),
      label: sel.from === sel.to ? this.t('rev.comment.point') : this.t('rev.comment.label'),
      value: '',
      multiline: true,
      confirmLabel: this.t('rev.comment.confirm'),
      onSubmit: async (v) => {
        if (v.trim()) await this.changeText(path, (text) => addComment(text, sel.from, sel.to, v).text);
      },
    };
  }

  askEditComment(path: string, mark: CriticMark, raw: string): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('rev.comment.edit'),
      label: this.t('rev.comment.title'),
      value: mark.comment,
      multiline: true,
      allowEmpty: true,
      confirmLabel: this.t('dialog.confirm'),
      onSubmit: (v) => void this.changeText(path, (text) => editComment(text, mark, raw, v)),
    };
  }

  resolveComment(path: string, mark: CriticMark, raw: string): Promise<boolean> {
    return this.changeText(path, (text) => resolveComment(text, mark, raw));
  }

  /** Accepts or rejects one suggested change. */
  settleChange(path: string, mark: CriticMark, raw: string, accept: boolean): Promise<boolean> {
    return this.changeText(path, (text) => (accept ? acceptChange(text, mark, raw) : rejectChange(text, mark, raw)));
  }

  /** Accepts or rejects every suggested change on a page (comments stay). */
  settleAllChanges(path: string, accept: boolean): Promise<boolean> {
    return this.changeText(path, (text) => settleAll(text, accept ? 'accept' : 'reject', ['insert', 'delete', 'replace']));
  }

  /* ------------------------------------------------------ editing: notes */

  addRevisionNote(path: string, note: string): Promise<boolean> {
    return this.changeText(path, (text) => addNote(text, note));
  }

  setRevisionNoteDone(path: string, index: number, done: boolean): Promise<boolean> {
    return this.changeText(path, (text) => setNoteDone(text, index, done));
  }

  removeRevisionNote(path: string, index: number): Promise<boolean> {
    return this.changeText(path, (text) => removeNote(text, index));
  }

  clearDoneRevisionNotes(path: string): Promise<boolean> {
    return this.changeText(path, (text) => clearDoneNotes(text));
  }

  askEditRevisionNote(path: string, index: number, current: string): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('rev.notes.edit'),
      label: this.t('rev.notes.editLabel'),
      value: current,
      allowEmpty: true,
      confirmLabel: this.t('dialog.confirm'),
      onSubmit: (v) => void this.changeText(path, (text) => changeNote(text, index, v)),
    };
  }

  /* ---------------------------------------------------- editing: versions */

  /**
   * Called by the editor before it saves a page: keeps a copy of the text as it is on disk, if the
   * last version is old enough and differs. Never stops the save.
   */
  async autoVersion(path: string): Promise<void> {
    const vault = this.vault;
    if (!vault || !this.on('versions')) return;
    const now = Date.now();
    const seen = this.versionSeen.get(path);
    if (seen !== undefined && !dueForVersion(seen, now)) return;
    this.versionSeen.set(path, now); // one look per pause, even while the look below runs
    try {
      const page = vault.getPage(path);
      if (!page?.raw.trim()) return;
      const latest = (await vault.versions(path))[0];
      if (latest && !dueForVersion(latest.time, now)) return void this.versionSeen.set(path, latest.time);
      if (latest && (await vault.readVersion(latest.file)) === page.raw) return;
      await vault.saveVersion(path, page.raw);
      this.versionsSeq++;
    } catch {
      /* A version that cannot be written must not stop the page from being saved. */
    }
  }

  /** Asks for a name and saves the page's current text as a version. */
  askSaveVersion(path: string): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('rev.versions.saveTitle'),
      label: this.t('rev.versions.nameLabel'),
      value: '',
      hint: this.t('rev.versions.nameHint'),
      allowEmpty: true,
      confirmLabel: this.t('dialog.confirm'),
      onSubmit: async (v) => {
        const vault = this.vault;
        if (!vault) return;
        try {
          await this.flush();
          const page = vault.getPage(path);
          if (!page) return;
          await vault.saveVersion(path, page.raw, v.trim() || undefined);
          this.versionSeen.set(path, Date.now());
          this.versionsSeq++;
          this.notify(this.t('rev.versions.saved'));
        } catch (e) {
          this.fail(e);
        }
      },
    };
  }

  askNameVersion(path: string, version: PageVersion): void {
    this.dialog = {
      kind: 'prompt',
      title: this.t('rev.versions.rename'),
      label: this.t('rev.versions.nameLabel'),
      value: version.name ?? '',
      hint: this.t('rev.versions.nameHint'),
      allowEmpty: true,
      confirmLabel: this.t('dialog.confirm'),
      onSubmit: async (v) => {
        try {
          await this.vault?.renameVersion(version, path, v);
          this.versionsSeq++;
        } catch (e) {
          this.fail(e);
        }
      },
    };
  }

  askDeleteVersion(version: PageVersion): void {
    this.dialog = {
      kind: 'confirm',
      title: this.t('rev.versions.deleteTitle'),
      message: this.t('rev.versions.deleteText', formatTime(this.lang, version.time)),
      confirmLabel: this.t('rev.versions.delete'),
      danger: true,
      onConfirm: async () => {
        try {
          await this.vault?.deleteVersion(version.file);
          if (this.compare && (this.compare.from === version.file || this.compare.to === version.file)) this.compare = null;
          this.versionsSeq++;
        } catch (e) {
          this.fail(e);
        }
      },
    };
  }

  /** Opens the comparison of a version with the page's current text. */
  compareVersion(path: string, file: string): void {
    this.compare = { path, from: file, to: null };
  }

  askRestoreVersion(path: string, version: PageVersion): void {
    this.dialog = {
      kind: 'confirm',
      title: this.t('cmp.restoreTitle'),
      message: this.t('cmp.restoreText', formatTime(this.lang, version.time)),
      confirmLabel: this.t('cmp.restore'),
      onConfirm: () => this.restoreVersion(path, version.file),
    };
  }

  /** Makes a version the page's text again. The current text is kept as a version first. */
  async restoreVersion(path: string, file: string): Promise<void> {
    const vault = this.vault;
    if (!vault) return;
    try {
      await this.flush();
      const text = await vault.readVersion(file);
      const current = vault.getPage(path)?.raw;
      if (current === undefined) return;
      if (current !== text) {
        if (current.trim()) await vault.saveVersion(path, current);
        this.versionSeen.set(path, Date.now());
        // Words that come back with an old version were not written today.
        this.uncounted.add(path);
        const ed = this.editor;
        if (ed && ed.path === path) {
          ed.apply(() => text);
          await this.flush();
        } else {
          this.uncounted.delete(path);
          await vault.savePage(path, text);
        }
      }
      this.versionsSeq++;
      this.compare = null;
      this.notify(this.t('cmp.restored'));
    } catch (e) {
      this.fail(e);
    }
  }

  fail(e: unknown): void {
    this.notify(this.t('toast.error', e instanceof Error ? e.message : String(e)), true);
  }

  /* ------------------------------------------------------------------ dialogs */

  askNewPage(dir = ''): void {
    this.dialog = { kind: 'newPage', title: this.t('dialog.newPage'), name: '', folder: dir, lockFolder: dir !== '' };
  }

  /** Asks for the name of a story, to set up its folders. */
  askProject(): void {
    if (!this.vault || !this.on('storyProjects')) return;
    this.dialog = {
      kind: 'prompt',
      title: this.t('project.new'),
      label: this.t('project.label'),
      value: '',
      confirmLabel: this.t('dialog.create'),
      hint: this.t('project.hint'),
      onSubmit: (v) => void this.createProject(v),
    };
  }

  /**
   * Makes the folders of a story project (see core/project.ts) and opens its overview. Pages that
   * already exist are left as they are, so asking again for the same story never overwrites anything.
   */
  async createProject(name: string): Promise<string | undefined> {
    const vault = this.vault;
    const story = projectName(name);
    if (!vault || !story) return undefined;
    try {
      await this.flush();
      let overview: string | undefined;
      let made = 0;
      for (const f of projectFiles(story, this.lang)) {
        if (vault.getPage(f.path) || (await vault.storage.exists(f.path))) {
          overview ??= f.path;
          continue;
        }
        const page = await vault.createPage(baseName(f.path), dirName(f.path), f.text);
        overview ??= page.path;
        made++;
      }
      if (!made) {
        this.notify(this.t('project.exists', story));
        return undefined;
      }
      this.notify(this.t('project.created', story));
      if (overview) await this.open(overview);
      return overview;
    } catch (e) {
      this.fail(e);
      return undefined;
    }
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
