<script lang="ts">
  import { app } from '../app.svelte';
  import { baseName, dirName } from '../core/names';
  import type { PanelGroup, PanelItem, PanelSectionId } from '../core/index';
  import Icon from './Icon.svelte';
  import Resizer from './Resizer.svelte';
  import { previewOn } from '../actions';

  let { path }: { path: string | null } = $props();
  const t = app.t;

  const model = $derived.by(() => {
    app.version;
    return app.vault && path ? app.vault.index.panel(path) : { sections: [] };
  });
  const hasAny = $derived(model.sections.some((s) => s.groups.length > 0));
  const relTypes = $derived.by(() => {
    app.version;
    return app.vault?.index.relationTypes() ?? [];
  });
  const pageNames = $derived.by(() => {
    app.version;
    return (app.vault?.pages ?? []).slice(0, 1000).map((p) => p.name);
  });
  const pageTitle = $derived.by(() => {
    app.version;
    return path ? (app.vault?.getPage(path)?.title ?? '') : '';
  });

  let type = $state('');
  let target = $state('');
  let createMissing = $state(true);
  let formError = $state('');
  let typeInput = $state<HTMLInputElement>();
  let targetInput = $state<HTMLInputElement>();

  const sectionTitle = (id: PanelSectionId) => t(`panel.section.${id}` as 'panel.section.relations');

  function groupLabel(section: PanelSectionId, g: PanelGroup): string {
    if (section === 'inverse') return g.inverseLabel ?? `← ${g.type}`;
    return g.type;
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!path) return;
    if (!type.trim() || !target.trim()) {
      formError = t('panel.add.needBoth');
      (type.trim() ? targetInput : typeInput)?.focus();
      return;
    }
    formError = '';
    const ok = await app.addRelation(path, type.trim(), target, createMissing);
    if (ok) {
      target = '';
      targetInput?.focus(); // keep the type, so several relations of one kind are quick to add
    }
  }

  function pinTarget(it: PanelItem): string {
    return it.path ? baseName(it.path) : it.target;
  }

  function openItem(it: PanelItem) {
    if (it.exists && it.path) void app.open(it.path, it.heading);
    else void app.confirmCreate(it.target, path ? dirName(path) : '');
  }
</script>

<aside class="relpanel" class:open={app.panelOpen} aria-label={t('panel.title')}>
  <Resizer edge="panel-edge" value={app.panelW} onresize={(w) => app.setPanelW(w)} label={t('panel.title')} />

  <header class="panel-head">
    <div class="panel-title-row">
      <h2 class="panel-title">{t('panel.title')}{#if pageTitle}<span class="panel-page"> · {pageTitle}</span>{/if}</h2>
      {#if path}
        <button class="icon-btn" title={t('panel.onGraph')} aria-label={t('panel.onGraph')} onclick={() => app.showOnGraph(path)}>
          <Icon name="relations" />
        </button>
      {/if}
    </div>
    <p class="order-note">{t('panel.order')}</p>
  </header>

  <div class="panel-scroll">
    {#if path}
      {#if !hasAny}
        <p class="rel-empty">{t('panel.empty')}</p>
      {/if}

      {#each model.sections as section (section.id)}
        {#if section.groups.length > 0}
          {@const secClosed = app.collapsed['sec:' + section.id]}
          <section class="rel-section">
            <button class="sec-title" aria-expanded={!secClosed} onclick={() => app.toggleCollapsed('sec:' + section.id)}>
              <span class="caret" class:open={!secClosed}>▸</span>{sectionTitle(section.id)}
            </button>
            {#if !secClosed}
              <div class="meridian">
                {#each section.groups as g (g.key)}
                  {@const closed = app.collapsed[g.key]}
                  {#if section.id === 'relations' || section.id === 'inverse'}
                    <div class="rel-group">
                      <button class="group-title" aria-expanded={!closed} onclick={() => app.toggleCollapsed(g.key)}>
                        <span class="caret" class:open={!closed}>▸</span>
                        {groupLabel(section.id, g)}
                        <span class="count">{g.items.length}</span>
                        {#if section.id === 'inverse' && g.inverseLabel}
                          <span class="sub">({t('panel.inverse', g.type)})</span>
                        {/if}
                      </button>
                      {#if !closed}{@render items(g, section.id)}{/if}
                    </div>
                  {:else}
                    <div class="rel-group">{@render items(g, section.id)}</div>
                  {/if}
                {/each}
              </div>
            {/if}
          </section>
        {/if}
      {/each}

      <form class="add-rel" onsubmit={add}>
        <h3>{t('panel.add')}</h3>
        <label class="field">
          {t('panel.add.type')}
          <input
            type="text"
            list="rel-types"
            placeholder={t('panel.add.type.placeholder')}
            bind:value={type}
            bind:this={typeInput}
            autocomplete="off"
          />
        </label>
        <label class="field">
          {t('panel.add.target')}
          <input
            type="text"
            list="page-names"
            placeholder={t('panel.add.target.placeholder')}
            bind:value={target}
            bind:this={targetInput}
            autocomplete="off"
          />
        </label>
        <label class="check"><input type="checkbox" bind:checked={createMissing} /> {t('panel.add.create')}</label>
        {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
        <div><button class="btn primary" type="submit">{t('panel.add.button')}</button></div>
        <datalist id="rel-types">{#each relTypes as rt (rt)}<option value={rt}></option>{/each}</datalist>
        <datalist id="page-names">{#each pageNames as n (n)}<option value={n}></option>{/each}</datalist>
      </form>
    {/if}
  </div>
</aside>

{#snippet items(g: PanelGroup, section: PanelSectionId)}
  <ul class="rel-items">
    {#each g.items as it (it.key)}
      <li class="rel-item" class:missing={!it.exists}>
        <button
          class="rel-link"
          onclick={() => openItem(it)}
          use:previewOn={{ target: it.path ? it.path.replace(/\.md$/i, '') : it.target, heading: it.heading }}
        >
          {it.title}{#if it.heading}<span class="heading"> › {it.heading}</span>{/if}
        </button>
        {#if it.count > 1}<span class="badge" title={t('panel.times', it.count)}>×{it.count}</span>{/if}
        {#if !it.exists}
          <button class="btn create-btn" onclick={() => openItem(it)}>{t('panel.create')}</button>
        {/if}
        <span class="acts">
          <button
            class="icon-btn"
            class:on={it.pinned}
            title={it.pinned ? t('panel.unpin') : t('panel.pin')}
            aria-label={it.pinned ? t('panel.unpin') : t('panel.pin')}
            aria-pressed={it.pinned}
            onclick={() => path && app.togglePin(path, pinTarget(it))}
          >
            <Icon name={it.pinned ? 'star-fill' : 'star'} />
          </button>
          {#if section === 'relations' && it.own && path}
            <button
              class="icon-btn"
              title={t('panel.remove')}
              aria-label={t('panel.remove')}
              onclick={() => app.removeRelation(path, g.type, it.target)}
            >
              <Icon name="x" />
            </button>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
{/snippet}
