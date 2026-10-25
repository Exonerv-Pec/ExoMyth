/**
 * The music of the app: one player for all playlists, kept outside the pages, so a playlist goes on
 * playing while you open other pages. The playlist page shows it with its tracks; elsewhere a small
 * player in the corner (`MusicHost`) controls it. The `<audio>` element lives in `MusicHost`, which
 * is never taken off the screen.
 */
import { app } from './app.svelte';
import { mediaUrl } from './embeds';
import { parsePlaylist, type Track } from './core/playlist';

function savedVolume(): number {
  try {
    const n = Number(localStorage.getItem('exomyth:volume') ?? '1');
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
  } catch {
    return 1;
  }
}

class Music {
  /** The playlist page whose tracks are loaded, or null when nothing is. */
  path = $state<string | null>(null);
  /** Its title, kept for the small player even if the page goes away. */
  title = $state('');
  index = $state(0);
  playing = $state(false);
  repeat = $state(false);
  /** Seconds into the track, and its length (0 until known). */
  time = $state(0);
  duration = $state(0);
  /** Loudness from 0 to 1, remembered in this browser. */
  volume = $state(savedVolume());
  /** The music has been started since this playlist was loaded: only then does the small player show. */
  started = $state(false);
  /** Playlist pages whose player is on screen now (the small player hides while the loaded one is). */
  screens = $state<string[]>([]);
  /** The tracks as they were last read, for when the page is not at hand (renamed, closed). */
  private known: Track[] = [];
  private audio: HTMLAudioElement | null = null;
  private autoplay = false;
  private token = 0;
  private loadedKey = '';

  /** The tracks of a playlist page now (the page may have changed since the music started). */
  tracksOf(path: string): Track[] {
    app.version;
    const page = app.vault?.getPage(path);
    return page ? parsePlaylist(page.body) : path === this.path ? this.known : [];
  }

  get tracks(): Track[] {
    return this.path ? this.tracksOf(this.path) : [];
  }

  /** Whether a track's file is in the world. */
  hasFile(track: Track | undefined): boolean {
    app.version;
    return !!track && !!app.vault?.resolveFile(track.target);
  }

  get current(): Track | undefined {
    const list = this.tracks;
    return list.length ? list[Math.min(this.index, list.length - 1)] : undefined;
  }

  attach(audio: HTMLAudioElement | null): void {
    this.audio = audio;
    if (audio) audio.volume = this.volume;
  }

  setVolume(v: number): void {
    const n = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));
    this.volume = n;
    if (this.audio) this.audio.volume = n;
    try {
      localStorage.setItem('exomyth:volume', String(n));
    } catch {
      /* Not remembered where storage is blocked. */
    }
  }

  /** Whether the player of the loaded playlist is on screen. */
  get onScreen(): boolean {
    return !!this.path && this.screens.includes(this.path);
  }

  /** A playlist page's player came on screen; the returned function takes it off again. */
  show(path: string): () => void {
    this.screens = [...this.screens, path];
    return () => {
      const i = this.screens.indexOf(path);
      if (i !== -1) this.screens = [...this.screens.slice(0, i), ...this.screens.slice(i + 1)];
    };
  }

  /** A playlist page on screen offers its first track, unless other music is already going. */
  offer(path: string): void {
    if (this.path === path || (this.path && this.started)) return;
    this.take(path, 0);
    void this.load();
  }

  private take(path: string, index: number): void {
    this.path = path;
    this.title = app.vault?.getPage(path)?.title ?? path;
    this.known = this.tracksOf(path);
    this.index = index;
    this.started = false;
    this.time = 0;
    this.duration = 0;
  }

  /** Plays (or only loads) track `i` of a playlist, taking over from any other playlist. */
  select(path: string, i: number, play: boolean): void {
    if (i < 0) return;
    if (this.path !== path) {
      this.audio?.pause?.();
      this.take(path, i);
      this.autoplay = play;
      void this.load();
      return;
    }
    const list = this.tracks;
    const key = (t: Track | undefined) => (t ? (app.vault?.resolveFile(t.target)?.path ?? t.target) : '');
    if (i === this.index || key(list[i]) === key(this.current)) {
      // The same file again: start it over.
      this.index = i;
      if (this.audio) {
        this.audio.currentTime = 0;
        if (play) this.start();
      }
      return;
    }
    this.index = i;
    this.autoplay = play;
    void this.load();
  }

  private start(): void {
    const el = this.audio;
    if (!el) return;
    this.started = true;
    const result = el.play?.();
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  }

  /** Loads the current track into the player (and starts it if asked to). */
  async load(): Promise<void> {
    const el = this.audio;
    const mine = ++this.token;
    const track = this.current;
    const file = track ? app.vault?.resolveFile(track.target) : undefined;
    const url = track && file ? await mediaUrl(track.target) : undefined;
    if (mine !== this.token || !el || el !== this.audio) return;
    if (!url) {
      // No file for this track: carry on with the next one if the music was meant to play.
      if (el.getAttribute('src')) el.removeAttribute('src');
      this.loadedKey = '';
      const wasAuto = this.autoplay;
      this.autoplay = false;
      if (wasAuto) this.select(this.path!, this.nextIndex(1), true);
      return;
    }
    this.loadedKey = `${file!.path}\u0000${file!.mtime}`;
    el.src = url;
    this.time = 0;
    this.updateSession();
    if (this.autoplay) {
      this.autoplay = false;
      this.start();
    }
  }

  /** The nearest track with a file in a direction; it wraps around only while repeating. */
  nextIndex(dir: 1 | -1): number {
    const list = this.tracks;
    const from = Math.min(this.index, list.length - 1);
    for (let i = from + dir; i >= 0 && i < list.length; i += dir) if (this.hasFile(list[i])) return i;
    if (this.repeat) {
      for (let k = 0; k < list.length; k++) {
        const i = dir > 0 ? k : list.length - 1 - k;
        if (this.hasFile(list[i])) return i;
      }
    }
    return -1;
  }

  toggle(): void {
    const el = this.audio;
    if (!el || !this.path) return;
    if (this.playing) return void el.pause?.();
    if (!el.getAttribute('src')) {
      this.autoplay = true;
      void this.load();
      return;
    }
    this.start();
  }

  next(): void {
    if (this.path) this.select(this.path, this.nextIndex(1), this.playing);
  }

  prev(): void {
    const el = this.audio;
    // Like a music player: a few seconds in, "previous" starts the track over.
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      return;
    }
    const p = this.nextIndex(-1);
    if (p >= 0 && this.path) this.select(this.path, p, this.playing);
    else if (el) el.currentTime = 0;
  }

  seek(seconds: number): void {
    if (this.audio && Number.isFinite(seconds)) this.audio.currentTime = Math.max(0, seconds);
  }

  ended(): void {
    const n = this.nextIndex(1);
    if (n >= 0 && this.path) this.select(this.path, n, true);
    else this.playing = false;
  }

  /** Stops the music and lets it go: the small player disappears. */
  stop(): void {
    this.token++;
    this.audio?.pause?.();
    if (this.audio?.getAttribute('src')) this.audio.removeAttribute('src');
    this.path = null;
    this.title = '';
    this.known = [];
    this.playing = false;
    this.started = false;
    this.time = 0;
    this.duration = 0;
    this.loadedKey = '';
    this.updateSession();
  }

  /** A playlist page left the screen: without "keeps playing", its music stops there. */
  left(path: string): void {
    if (this.path !== path) return;
    if (!app.on('musicKeepsPlaying')) {
      this.token++;
      this.audio?.pause?.();
    }
  }

  /** The page was renamed or moved: the music follows it. */
  moved(from: string, to: string): void {
    if (this.path === from) this.path = to;
  }

  /** The playlist page changed: keep playing the same file if it is still in the list. */
  refresh(): void {
    if (!this.path) return;
    const page = app.vault?.getPage(this.path);
    if (!page) return;
    const list = parsePlaylist(page.body);
    const was = this.known[Math.min(this.index, this.known.length - 1)];
    this.known = list;
    this.title = page.title;
    if (was) {
      const same = list.findIndex((t) => t.target === was.target);
      if (same >= 0 && same !== this.index) this.index = same;
    }
    const track = this.current;
    const file = track ? app.vault?.resolveFile(track.target) : undefined;
    const key = file ? `${file.path}\u0000${file.mtime}` : '';
    if (key !== this.loadedKey) {
      this.autoplay = this.playing;
      void this.load();
    }
  }

  /** Track name and buttons for the system (lock screen, media keys), where the browser offers it. */
  private updateSession(): void {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    try {
      const Meta = (globalThis as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata;
      ms.metadata = this.path && this.current && Meta ? new Meta({ title: this.current.title, album: this.title }) : null;
      if (!this.path) return;
      ms.setActionHandler('play', () => this.toggle());
      ms.setActionHandler('pause', () => this.toggle());
      ms.setActionHandler('nexttrack', () => this.next());
      ms.setActionHandler('previoustrack', () => this.prev());
    } catch {
      /* A browser without some of these simply does not show them. */
    }
  }
}

export const music = new Music();
