<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../app.svelte';
  import { music } from '../music.svelte';
  import Icon from './Icon.svelte';

  let { path }: { path: string } = $props();
  const t = app.t;

  const tracks = $derived(music.tracksOf(path));
  /** This page's playlist is the one in the player (another may be playing elsewhere). */
  const mine = $derived(music.path === path);
  const cur = $derived(mine && tracks.length ? Math.min(music.index, tracks.length - 1) : tracks.length ? 0 : -1);
  const playing = $derived(mine && music.playing);
  const other = $derived(!mine && music.path && music.started ? music.title : '');

  // On screen: the small player hides, and an idle player takes this playlist.
  $effect(() => {
    const p = path;
    const hide = untrack(() => music.show(p));
    untrack(() => music.offer(p));
    return () => {
      hide();
      untrack(() => music.left(p));
    };
  });

  const clock = (s: number) => {
    const n = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  };

  function play() {
    if (mine) music.toggle();
    else music.select(path, Math.max(0, cur), true);
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
    {#if other}<p class="pl-other">{t('music.other', other)}</p>{/if}
    <div class="pl-controls">
      <button class="icon-btn pl-play" title={playing ? t('music.pause') : t('music.play')} aria-label={playing ? t('music.pause') : t('music.play')} onclick={play}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <button class="icon-btn" title={t('playlist.prev')} aria-label={t('playlist.prev')} onclick={() => (mine ? music.prev() : music.select(path, 0, false))}><Icon name="skip-back" /></button>
      <button class="icon-btn" title={t('playlist.next')} aria-label={t('playlist.next')} onclick={() => (mine ? music.next() : music.select(path, Math.min(tracks.length - 1, 1), false))}><Icon name="skip-forward" /></button>
      <button
        class="icon-btn"
        class:on={music.repeat}
        title={t('playlist.repeat')}
        aria-label={t('playlist.repeat')}
        aria-pressed={music.repeat}
        onclick={() => (music.repeat = !music.repeat)}
      >
        <Icon name="repeat" />
      </button>
      <input
        class="pl-volume"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={music.volume}
        aria-label={t('music.volume')}
        title={t('music.volume')}
        oninput={(e) => music.setVolume(Number(e.currentTarget.value))}
      />
      <span class="pl-time">{mine ? clock(music.time) : '0:00'}{mine && music.duration ? ` / ${clock(music.duration)}` : ''}</span>
    </div>
    <input
      class="pl-seek"
      type="range"
      min="0"
      max={mine && music.duration ? music.duration : 1}
      step="0.1"
      value={mine ? music.time : 0}
      disabled={!mine || !music.duration}
      aria-label={t('music.seek')}
      oninput={(e) => music.seek(Number(e.currentTarget.value))}
    />
    <ol class="pl-tracks" aria-label={t('playlist.tracks')}>
      {#each tracks as tr, i (i)}
        {@const has = music.hasFile(tr)}
        <li class:current={i === cur} class:missing={!has}>
          <button type="button" aria-current={i === cur ? 'true' : undefined} disabled={!has} onclick={() => music.select(path, i, true)}>
            <span class="n">{i + 1}</span>
            <span class="t">{tr.title}</span>
            {#if !has}<span class="m">{t('media.missing', tr.target)}</span>{/if}
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>
