<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../app.svelte';
  import { mediaUrl } from '../embeds';
  import { parsePlaylist } from '../core/playlist';
  import Icon from './Icon.svelte';

  let { path }: { path: string } = $props();
  const t = app.t;

  const tracks = $derived.by(() => {
    app.version;
    const page = app.vault?.getPage(path);
    return page ? parsePlaylist(page.body) : [];
  });
  /** The file of each track, when it is in the world. */
  const files = $derived.by(() => {
    app.version;
    return tracks.map((tr) => app.vault?.resolveFile(tr.target));
  });
  const keyOf = (i: number) => {
    const f = files[i];
    return f ? `${f.path}\u0000${f.mtime}` : '';
  };

  let index = $state(0);
  let repeat = $state(false);
  let playing = $state(false);
  let audio = $state<HTMLAudioElement>();
  /** The next loaded track starts by itself: it was picked in the list, or the one before it ended. */
  let autoplay = false;
  let token = 0;

  const cur = $derived(tracks.length ? Math.min(index, tracks.length - 1) : -1);
  const key = $derived(cur >= 0 ? keyOf(cur) : '');

  function start(el: HTMLAudioElement) {
    const result = el.play?.();
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  }

  /** The nearest track with a file in a direction; it wraps around only while repeating. */
  function nextIndex(from: number, dir: 1 | -1): number {
    for (let i = from + dir; i >= 0 && i < tracks.length; i += dir) if (files[i]) return i;
    if (repeat) {
      for (let k = 0; k < tracks.length; k++) {
        const i = dir > 0 ? k : tracks.length - 1 - k;
        if (files[i]) return i;
      }
    }
    return -1;
  }

  function go(i: number, play: boolean) {
    if (i < 0) return;
    if (i === cur || keyOf(i) === key) {
      // The same file again: start it over.
      index = i;
      autoplay = false;
      if (audio) {
        audio.currentTime = 0;
        if (play) start(audio);
      }
      return;
    }
    autoplay = play;
    index = i;
  }

  async function load() {
    const el = audio;
    if (!el) return;
    const mine = ++token;
    const track = cur >= 0 ? tracks[cur] : undefined;
    const url = track && files[cur] ? await mediaUrl(track.target) : undefined;
    if (mine !== token || el !== audio) return;
    if (!url) {
      // No file for this track: leave it, and carry on with the next one if the music was playing.
      if (el.getAttribute('src')) el.removeAttribute('src');
      const wasAuto = autoplay;
      autoplay = false;
      if (wasAuto) go(nextIndex(cur, 1), true);
      return;
    }
    el.src = url;
    if (autoplay) {
      autoplay = false;
      start(el);
    }
  }

  // A different track (or the same file changed) loads into the player.
  $effect(() => {
    key;
    audio;
    untrack(() => void load());
  });

  // Leaving the page stops the music: a player taken off the page would otherwise keep playing.
  $effect(() => () => {
    token++;
    if (typeof audio?.pause === 'function') audio.pause();
  });

  function onEnded() {
    const n = nextIndex(cur, 1);
    if (n >= 0) go(n, true);
    else playing = false;
  }
  function next() {
    go(nextIndex(cur, 1), playing);
  }
  function prev() {
    // Like a music player: a few seconds in, "previous" starts the track over.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const p = nextIndex(cur, -1);
    if (p >= 0) go(p, playing);
    else if (audio) audio.currentTime = 0;
  }
</script>

<section class="playlist" aria-label={t('playlist.label')}>
  {#if tracks.length === 0}
    <p class="pl-empty">{t('playlist.empty')}</p>
  {:else}
    <div class="pl-head">
      <span class="pl-now">{tracks[cur]?.title}</span>
      <span class="pl-pos">{t('playlist.position', cur + 1, tracks.length)}</span>
    </div>
    <audio bind:this={audio} controls preload="metadata" onended={onEnded} onplay={() => (playing = true)} onpause={() => (playing = false)}></audio>
    <div class="pl-controls">
      <button class="icon-btn" title={t('playlist.prev')} aria-label={t('playlist.prev')} onclick={prev}><Icon name="skip-back" /></button>
      <button class="icon-btn" title={t('playlist.next')} aria-label={t('playlist.next')} onclick={next}><Icon name="skip-forward" /></button>
      <button
        class="icon-btn"
        class:on={repeat}
        title={t('playlist.repeat')}
        aria-label={t('playlist.repeat')}
        aria-pressed={repeat}
        onclick={() => (repeat = !repeat)}
      >
        <Icon name="repeat" />
      </button>
    </div>
    <ol class="pl-tracks" aria-label={t('playlist.tracks')}>
      {#each tracks as tr, i (i)}
        <li class:current={i === cur} class:missing={!files[i]}>
          <button type="button" aria-current={i === cur ? 'true' : undefined} disabled={!files[i]} onclick={() => go(i, true)}>
            <span class="n">{i + 1}</span>
            <span class="t">{tr.title}</span>
            {#if !files[i]}<span class="m">{t('media.missing', tr.target)}</span>{/if}
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>
