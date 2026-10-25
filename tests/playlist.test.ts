import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { isPlaylist, parsePlaylist, withoutTracks } from '../src/core/playlist';
import { featureUsage } from '../src/core/usage';
import { parsePage } from '../src/core/parse';
import { PROFILES, starterFiles } from '../src/core/profiles';
import { music } from '../src/music.svelte';

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

beforeAll(() => {
  // jsdom has no layout engine or media player; CodeMirror and the player only need these to exist.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const urls = new Map<Blob, string>();
  URL.createObjectURL = (b: Blob | MediaSource) => {
    if (!urls.has(b as Blob)) urls.set(b as Blob, `blob:track-${urls.size + 1}`);
    return urls.get(b as Blob)!;
  };
  URL.revokeObjectURL = () => {};
  HTMLMediaElement.prototype.play = play;
  HTMLMediaElement.prototype.pause = pause;
});

describe('playlist pages', () => {
  it('are pages with playlist: true in the header', () => {
    const is = (fm: Record<string, unknown>) => isPlaylist({ frontmatter: fm });
    expect(is({ playlist: true })).toBe(true);
    expect(is({ playlist: 'yes' })).toBe(true);
    expect(is({ playlist: 'плейлист' })).toBe(true);
    expect(is({ playlist: false })).toBe(false);
    expect(is({ playlist: 'no' })).toBe(false);
    expect(is({})).toBe(false);
  });

  it('list their audio tracks in order, with names from the link or the file', () => {
    const body = [
      '# Tavern',
      '',
      'Played while the party rests.',
      '',
      '- ![[Fiddle in the rain.mp3]]',
      '- [[music/Last call.ogg|Last call, slow]]',
      '1. ![[a/b/Dawn.wav|300]]',
      '- [[Kira Vale]] is not music',
      '- ![[map.png]]',
      '* Mentioned: ![[Second.flac]] and ![[Third.flac]]',
      '```',
      '- ![[Inside code.mp3]]',
      '```',
      'A line outside lists ![[Loose.mp3]]',
    ].join('\n');
    expect(parsePlaylist(body)).toEqual([
      { target: 'Fiddle in the rain.mp3', title: 'Fiddle in the rain', line: 4 },
      { target: 'music/Last call.ogg', title: 'Last call, slow', line: 5 },
      { target: 'a/b/Dawn.wav', title: 'Dawn', line: 6 },
      { target: 'Second.flac', title: 'Second', line: 9 },
    ]);
  });

  it('keep everything that is not a track when the reading view drops the track lines', () => {
    const body = 'Intro\n\n- ![[a.mp3]]\n- [[Kira Vale]]\n- ![[b.mp3]]\n\nOutro';
    expect(withoutTracks(body)).toBe('Intro\n\n- [[Kira Vale]]\n\nOutro');
    expect(withoutTracks('No music here')).toBe('No music here');
  });

  it('are found for Settings, and the Game master start page explains them', async () => {
    const vault = await Vault.open(new MemoryStorage('u', { 'Tavern.md': '---\nplaylist: true\n---\n- ![[a.mp3]]\n', 'Plain.md': '# Plain\n' }));
    expect(featureUsage(vault.index).playlists.map((p) => p.title)).toEqual(['Tavern']);
    for (const lang of ['en', 'ru'] as const) {
      const start = starterFiles('gamemaster', lang, 'Campaign').find((f) => /Start here|С чего начать/.test(f.path))!;
      expect(start.text).toContain('playlist: true');
      expect(parsePage(start.path, start.text, 1).parseError).toBeUndefined();
    }
    expect(PROFILES.find((p) => p.id === 'notes')!.off).toContain('playlists');
    expect(PROFILES.find((p) => p.id === 'writer')!.off).not.toContain('playlists');
  });
});

describe('the playlist player', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.resetFeatures();
    app.settingsOpen = false;
    app.closeVault();
    app.setMode('split');
    music.stop();
    music.repeat = false;
    play.mockClear();
    pause.mockClear();
  });

  const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  async function boot(tracks = ['- ![[One.mp3]]', '- ![[Two.mp3|Second song]]', '- ![[Three.mp3]]'], files = ['One.mp3', 'Two.mp3', 'Three.mp3']) {
    app.lang = 'en';
    app.setMode('preview');
    const storage = new MemoryStorage(`pl-${Math.random()}`, {
      'Tavern.md': `---\nplaylist: true\n---\n# Tavern\n\nPlayed while the party rests.\n\n${tracks.join('\n')}\n`,
      'Plain.md': '# Plain\n\n- ![[One.mp3]]\n',
    });
    for (const f of files) await storage.writeBytes(`music/${f}`, new Uint8Array([1, 2, 3, f.length]));
    const vault = await Vault.open(storage);
    app.setVault(vault);
    app.current = 'Tavern.md';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    return { target, vault };
  }

  // One player for the whole app, outside the pages.
  const audio = () => document.querySelector<HTMLAudioElement>('audio.music-audio')!;
  const rows = () => [...document.querySelectorAll('.pl-tracks li')];
  const current = () => rows().findIndex((r) => r.classList.contains('current'));
  const click = async (el: Element) => {
    (el as HTMLElement).click();
    flushSync();
    await wait();
    flushSync();
  };
  const ended = async () => {
    audio().dispatchEvent(new Event('ended'));
    flushSync();
    await wait();
    flushSync();
  };

  it('shows the tracks next to the text, loads the first one and plays nothing by itself', async () => {
    const { target } = await boot();
    expect(target.querySelector('.playlist')).toBeTruthy();
    expect(rows().map((r) => r.querySelector('.t')!.textContent)).toEqual(['One', 'Second song', 'Three']);
    expect(target.querySelector('.pl-pos')!.textContent).toBe('Track 1 of 3');
    expect(target.querySelector('.pl-now')!.textContent).toBe('One');
    expect(audio().getAttribute('src')).toMatch(/^blob:track-/);
    expect(play).not.toHaveBeenCalled();
    // The track lines are listed in the player, not repeated as three more players in the text.
    const prose = target.querySelector('.prose')!;
    expect(prose.textContent).toContain('Played while the party rests.');
    expect(prose.querySelectorAll('.embed').length).toBe(0);
    // The header flag is not a fact about the page.
    expect(target.querySelector('.infobox')).toBeNull();
  });

  it('plays a track picked from the list, then the next ones in order, then stops', async () => {
    await boot();
    const first = audio().getAttribute('src');
    await click(rows()[1]!.querySelector('button')!);
    expect(current()).toBe(1);
    expect(audio().getAttribute('src')).not.toBe(first);
    expect(play).toHaveBeenCalledTimes(1);
    await ended();
    expect(current()).toBe(2);
    expect(document.querySelector('.pl-pos')!.textContent).toBe('Track 3 of 3');
    expect(play).toHaveBeenCalledTimes(2);
    await ended();
    expect(current()).toBe(2);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('goes back to the first track when repeating', async () => {
    await boot();
    await click(rows()[2]!.querySelector('button')!);
    const repeat = document.querySelector<HTMLButtonElement>('.pl-controls button[aria-label="Repeat the playlist"]')!;
    await click(repeat);
    expect(repeat.getAttribute('aria-pressed')).toBe('true');
    await ended();
    expect(current()).toBe(0);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('has previous and next buttons; previous starts a track over once it is a few seconds in', async () => {
    await boot();
    const btn = (label: string) => document.querySelector<HTMLButtonElement>(`.pl-controls button[aria-label="${label}"]`)!;
    await click(btn('Next track'));
    expect(current()).toBe(1);
    // Not playing: moving on only loads the track.
    expect(play).not.toHaveBeenCalled();
    Object.defineProperty(audio(), 'currentTime', { value: 12, writable: true, configurable: true });
    await click(btn('Previous track'));
    expect(current()).toBe(1);
    expect(audio().currentTime).toBe(0);
    await click(btn('Previous track'));
    expect(current()).toBe(0);
  });

  it('marks a track whose file is missing and skips it', async () => {
    await boot(['- ![[One.mp3]]', '- ![[Gone.mp3]]', '- ![[Three.mp3]]'], ['One.mp3', 'Three.mp3']);
    const gone = rows()[1]!;
    expect(gone.classList.contains('missing')).toBe(true);
    expect(gone.textContent).toContain('File not found: Gone.mp3');
    expect(gone.querySelector('button')!.disabled).toBe(true);
    await click(rows()[0]!.querySelector('button')!);
    await ended();
    expect(current()).toBe(2);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('keeps playing on other pages, with a small player that controls it', async () => {
    await boot();
    expect(document.querySelector('.mini-player')).toBeNull();
    await click(document.querySelector('.pl-controls button[aria-label="Play"]')!);
    expect(play).toHaveBeenCalledTimes(1);
    const src = audio().getAttribute('src');
    // On the playlist page itself there is no small player.
    expect(document.querySelector('.mini-player')).toBeNull();
    pause.mockClear();
    app.current = 'Plain.md';
    flushSync();
    await wait();
    flushSync();
    expect(document.querySelector('.playlist')).toBeNull();
    expect(pause).not.toHaveBeenCalled();
    expect(audio().getAttribute('src')).toBe(src);
    const mini = document.querySelector('.mini-player')!;
    expect(mini.querySelector('.mp-track')!.textContent).toBe('One');
    expect(mini.querySelector('.mp-list')!.textContent).toBe('Tavern');
    await click(mini.querySelector('button[aria-label="Next track"]')!);
    expect(mini.querySelector('.mp-track')!.textContent).toBe('Second song');
    // The name opens the playlist again, where the small player goes away.
    await click(mini.querySelector('.mp-what')!);
    expect(app.current).toBe('Tavern.md');
    expect(document.querySelector('.mini-player')).toBeNull();
    expect(current()).toBe(1);
    // Stop: the music and the small player go.
    app.current = 'Plain.md';
    flushSync();
    await wait();
    flushSync();
    await click(document.querySelector('.mini-player button[aria-label="Stop the music"]')!);
    expect(document.querySelector('.mini-player')).toBeNull();
    expect(audio().getAttribute('src')).toBeNull();
  });

  it('follows its page when it is renamed, and stops when the world closes', async () => {
    await boot();
    await click(rows()[0]!.querySelector('button')!);
    await app.renamePage('Tavern.md', 'Inn');
    flushSync();
    expect(music.path).toBe('Inn.md');
    app.closeVault();
    flushSync();
    await wait();
    expect(music.path).toBeNull();
  });

  it('stops when you leave the page if "Music keeps playing" is off', async () => {
    await boot();
    app.setFeature('musicKeepsPlaying', false);
    await click(rows()[0]!.querySelector('button')!);
    pause.mockClear();
    app.current = 'Plain.md';
    flushSync();
    await wait();
    flushSync();
    expect(pause).toHaveBeenCalled();
    expect(document.querySelector('.mini-player')).toBeNull();
  });

  it('can be switched off in Settings: the page is then plain text with its own players', async () => {
    const { target } = await boot();
    app.setFeature('playlists', false);
    flushSync();
    await wait();
    expect(target.querySelector('.playlist')).toBeNull();
    expect(target.querySelectorAll('.prose .embed-audio').length).toBe(3);
  });

  it('is a switch in Settings that says which pages are playlists', async () => {
    await boot();
    app.settingsOpen = true;
    flushSync();
    const row = [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')].find((l) => l.querySelector('.setting-name')!.textContent === 'Playlists')!;
    expect(row.querySelector('input')!.checked).toBe(true);
    expect(row.nextElementSibling!.textContent).toContain('Used on 1 page');
  });

  it('says so when a playlist has no tracks yet', async () => {
    const { target } = await boot([], []);
    expect(target.querySelector('.playlist .pl-empty')!.textContent).toContain('No tracks yet');
    expect(target.querySelector('.playlist audio')).toBeNull();
  });
});

describe('the volume', () => {
  it('is kept between 0 and 1 and remembered in the browser', async () => {
    const { music } = await import('../src/music.svelte');
    music.setVolume(0.4);
    expect(music.volume).toBe(0.4);
    expect(localStorage.getItem('exomyth:volume')).toBe('0.4');
    music.setVolume(7);
    expect(music.volume).toBe(1);
    music.setVolume(Number.NaN);
    expect(music.volume).toBe(1);
  });
});
