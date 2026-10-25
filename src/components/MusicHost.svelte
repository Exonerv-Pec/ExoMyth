<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../app.svelte';
  import { music } from '../music.svelte';
  import Icon from './Icon.svelte';

  const t = app.t;
  let audio = $state<HTMLAudioElement>();

  $effect(() => {
    music.attach(audio ?? null);
    return () => music.attach(null);
  });

  // The playlist page was edited (or a file changed): keep playing the right track.
  $effect(() => {
    app.version;
    untrack(() => music.refresh());
  });

  // Closing the world, or switching playlists off, stops the music.
  $effect(() => {
    if (!app.vault || !app.on('playlists')) untrack(() => music.path && music.stop());
  });

  /** The small player shows while music is going and its playlist page is not on screen. */
  const mini = $derived(!!app.vault && !!music.path && music.started && !music.onScreen && app.on('playlists') && app.on('musicKeepsPlaying'));
  const track = $derived(music.current);
  /** Opens the playlist page where its player shows: "Text" alone would hide it. */
  async function openPlaylist() {
    if (!music.path) return;
    await app.openText(music.path);
    if (app.mode === 'edit') app.setMode('preview');
  }
  const progress = $derived(music.duration > 0 ? Math.min(100, (music.time / music.duration) * 100) : 0);
</script>

<audio
  bind:this={audio}
  class="music-audio"
  preload="metadata"
  hidden
  onplay={() => ((music.playing = true), (music.started = true))}
  onpause={() => (music.playing = false)}
  onended={() => music.ended()}
  ontimeupdate={(e) => (music.time = e.currentTarget.currentTime || 0)}
  ondurationchange={(e) => (music.duration = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
></audio>

{#if mini}
  <div class="mini-player" class:in-focus={app.focus} role="region" aria-label={t('music.label')}>
    <span class="mp-bar" style:width="{progress}%" aria-hidden="true"></span>
    <button class="mp-what" title={t('music.open')} onclick={openPlaylist}>
      <span class="mp-note" aria-hidden="true">♪</span>
      <span class="mp-text">
        <span class="mp-track">{track?.title ?? ''}</span>
        <span class="mp-list">{music.title}</span>
      </span>
    </button>
    <span class="mp-buttons">
      <button class="icon-btn" title={t('playlist.prev')} aria-label={t('playlist.prev')} onclick={() => music.prev()}><Icon name="skip-back" /></button>
      <button class="icon-btn mp-play" title={music.playing ? t('music.pause') : t('music.play')} aria-label={music.playing ? t('music.pause') : t('music.play')} onclick={() => music.toggle()}>
        <Icon name={music.playing ? 'pause' : 'play'} />
      </button>
      <button class="icon-btn" title={t('playlist.next')} aria-label={t('playlist.next')} onclick={() => music.next()}><Icon name="skip-forward" /></button>
      <button class="icon-btn" title={t('music.stop')} aria-label={t('music.stop')} onclick={() => music.stop()}><Icon name="x" /></button>
    </span>
  </div>
{/if}
