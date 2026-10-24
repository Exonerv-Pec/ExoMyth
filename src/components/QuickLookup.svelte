<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../app.svelte';
  import { searchPages } from '../core/search';
  import { pagePreview } from '../core/preview';
  import { renderMarkdown } from '../core/render';
  import { embeds } from '../embeds';
  import Icon from './Icon.svelte';

  const t = app.t;

  let input = $state<HTMLInputElement>();
  let query = $state('');
  let chosen = $state(0);
  /** Where the focus was before the look-up opened, so closing puts it back (the text being written). */
  let opener: HTMLElement | null = null;
  let wasOpen = false;

  const hits = $derived.by(() => {
    app.version;
    return app.lookupOpen && app.vault && query.trim() ? searchPages(app.vault.pages, query, 12) : [];
  });
  const active = $derived(Math.min(chosen, hits.length - 1));
  const hit = $derived(hits[active]);

  const preview = $derived.by(() => {
    app.version;
    return hit && app.vault ? pagePreview(app.vault.index, hit.page.path) : null;
  });
  const body = $derived.by(() => {
    app.version;
    return preview?.excerpt && app.vault ? renderMarkdown(preview.excerpt, app.vault.index) : '';
  });
  const facts = $derived.by(() => {
    app.version;
    if (!preview || !app.vault) return [];
    const index = app.vault.index;
    return preview.facts.map((f) => ({
      key: f.key,
      html: renderMarkdown(f.value, index).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1'),
    }));
  });

  // Opening starts with an empty field; closing returns to where the person was.
  $effect(() => {
    const open = app.lookupOpen;
    if (open && !wasOpen) {
      const el = document.activeElement;
      opener = el instanceof HTMLElement && el !== document.body ? el : null;
      query = '';
      chosen = 0;
      void tick().then(() => input?.focus());
    } else if (!open && wasOpen) {
      if (opener?.isConnected) opener.focus();
      opener = null;
    }
    wasOpen = open;
  });

  // Keep the chosen result in view while moving with the arrows.
  $effect(() => {
    active;
    if (!app.lookupOpen) return;
    void tick().then(() => document.getElementById(`lookup-opt-${active}`)?.scrollIntoView({ block: 'nearest' }));
  });

  function close() {
    app.lookupOpen = false;
  }

  function openPath(path: string) {
    // Leave without handing the focus back: the page being opened takes it.
    opener = null;
    app.lookupOpen = false;
    void app.open(path);
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (hits.length === 0) return;
      e.preventDefault();
      chosen = (active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
    } else if (e.key === 'Enter' && hit) {
      e.preventDefault();
      openPath(hit.page.path);
    }
  }

  function onPreviewClick(e: MouseEvent) {
    const el = e.target as HTMLElement | null;
    const spoiler = el?.closest<HTMLElement>('.spoiler');
    if (spoiler) {
      spoiler.classList.toggle('revealed');
      return;
    }
    const link = el?.closest<HTMLAnchorElement>('a.wikilink');
    if (link) {
      e.preventDefault();
      opener = null;
      app.lookupOpen = false;
      void app.openTarget(link.dataset.target ?? '', link.dataset.heading);
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.lookupOpen && close()} />

{#if app.lookupOpen && app.vault}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim lookup-scrim" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="dialog lookup" role="dialog" aria-modal="true" aria-label={t('lookup.title')} tabindex="-1" onkeydown={keydown}>
      <div class="lookup-bar">
        <Icon name="search" />
        <input
          bind:this={input}
          bind:value={query}
          oninput={() => (chosen = 0)}
          type="text"
          role="combobox"
          aria-label={t('lookup.label')}
          aria-expanded={hits.length > 0}
          aria-controls="lookup-list"
          aria-activedescendant={hit ? `lookup-opt-${active}` : undefined}
          placeholder={t('lookup.placeholder')}
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn ghost" onclick={close}>{t('lookup.close')}</button>
      </div>

      <div class="lookup-body">
        <div class="lookup-list" id="lookup-list" role="listbox" aria-label={t('lookup.results')}>
          {#if query.trim() && hits.length === 0}
            <p class="side-note">{t('lookup.empty')}</p>
          {:else if !query.trim()}
            <p class="side-note">{t('lookup.hint')}</p>
          {/if}
          {#each hits as h, i (h.page.path)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              id="lookup-opt-{i}"
              class="lookup-hit"
              class:chosen={i === active}
              role="option"
              tabindex="-1"
              aria-selected={i === active}
              onmousemove={() => (chosen = i)}
              onclick={() => openPath(h.page.path)}
            >
              <span class="t">{h.page.title}</span>
              <span class="p">{h.page.path}</span>
              {#if h.snippet}<span class="s">{h.snippet}</span>{/if}
            </div>
          {/each}
        </div>

        {#if preview?.exists}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <section class="lookup-preview" aria-label={t('preview.label', preview.title)} onclick={onPreviewClick}>
            <header>
              <h3>{preview.title}</h3>
              {#if preview.folder || preview.aliases.length}
                <p class="meta">
                  {preview.folder}{#if preview.folder && preview.aliases.length}<span class="sep" aria-hidden="true"></span>{/if}{#if preview.aliases.length}{t('page.aliases', preview.aliases.join(', '))}{/if}
                </p>
              {/if}
            </header>
            {#if facts.length > 0}
              <dl class="facts" use:embeds={facts}>
                {#each facts as f (f.key)}
                  <dt>{f.key}</dt>
                  <dd>{@html f.html}</dd>
                {/each}
              </dl>
            {/if}
            {#if body}
              <div class="prose excerpt" class:faded={preview.truncated} use:embeds={body}>{@html body}</div>
            {/if}
            <footer>
              <span>{t('preview.relations', preview.relations)}</span>
              <span>{t('preview.backlinks', preview.backlinks)}</span>
              <button class="btn ghost" onclick={() => openPath(preview.path!)}>{t('preview.open')}</button>
            </footer>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}
