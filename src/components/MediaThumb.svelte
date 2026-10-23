<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app } from '../app.svelte';
  import { mediaUrl } from '../embeds';

  /** Shows an image of the world; renders `fallback` while loading or when the file is missing. */
  let { target, alt = '', fallback }: { target?: string; alt?: string; fallback?: Snippet } = $props();
  let url = $state<string | undefined>();

  $effect(() => {
    app.version;
    const t = target;
    url = undefined;
    if (!t) return;
    let alive = true;
    void mediaUrl(t).then((u) => {
      if (alive) url = u;
    });
    return () => {
      alive = false;
    };
  });
</script>

{#if url}
  <img src={url} {alt} loading="lazy" decoding="async" />
{:else if fallback}
  {@render fallback()}
{/if}
