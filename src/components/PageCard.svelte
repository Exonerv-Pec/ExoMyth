<script lang="ts">
  import { app } from '../app.svelte';
  import type { CardModel } from '../core/cards';
  import MediaThumb from './MediaThumb.svelte';

  let {
    card,
    color,
    count = 1,
    selected = false,
    faded = false,
    onselect,
    onopen,
  }: {
    card: CardModel;
    /** CSS colour of the card's folder. */
    color: string;
    count?: number;
    selected?: boolean;
    /** The page does not exist in the year being shown. */
    faded?: boolean;
    onselect: () => void;
    onopen: () => void;
  } = $props();

  const t = app.t;
</script>

<button
  class="page-card"
  class:missing={!card.exists}
  class:selected
  class:faded
  style:--c={color}
  onclick={onselect}
  ondblclick={onopen}
  title={card.exists ? card.title : t('cards.missing')}
>
  <span class="pc-media" aria-hidden="true">
    <MediaThumb target={card.image} alt="">
      {#snippet fallback()}
        <span class="pc-initials">{card.initials}</span>
      {/snippet}
    </MediaThumb>
  </span>
  <span class="pc-body">
    <span class="pc-title">{card.title}{#if count > 1}<span class="pc-count"> ×{count}</span>{/if}</span>
    {#if card.exists}
      <span class="pc-folder"><span class="pc-dot"></span>{card.folder || t('graph.root')}</span>
      {#each card.facts as f (f.key)}
        <span class="pc-fact"><span class="k">{f.key}</span> {f.value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a)}</span>
      {/each}
    {:else}
      <span class="pc-folder">{t('cards.missing')}</span>
    {/if}
  </span>
</button>
