<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../app.svelte';
  import { parseGuide, topicMatches, type GuideTopic } from '../core/guide';
  import { renderMarkdown } from '../core/render';
  import { VaultIndex } from '../core/index';
  import { DEFAULT_SETTINGS } from '../core/types';
  import type { Feature } from '../app.svelte';
  import guideEn from '../../docs/GUIDE.md?raw';
  import guideRu from '../../docs/GUIDE.ru.md?raw';

  const t = app.t;
  const topicsBy = { en: parseGuide(guideEn), ru: parseGuide(guideRu) };
  const noPages = new VaultIndex([], DEFAULT_SETTINGS);

  const topics = $derived(topicsBy[app.lang]);
  let query = $state('');
  const shown = $derived(topics.filter((topic) => topicMatches(topic, query)));
  /** On a wide screen a topic is always open; on a narrow one the list comes first. */
  let narrow = $state(false);
  const current = $derived<GuideTopic | undefined>(topics.find((topic) => topic.id === app.guideTopic) ?? (narrow ? undefined : topics[0]));
  const html = $derived(current ? renderMarkdown(current.body, noPages) : '');
  /** Pictures that did not load (the one-file build has none). */
  let failed = $state<Record<string, boolean>>({});
  let article = $state<HTMLElement>();
  let searchInput = $state<HTMLInputElement>();

  $effect(() => {
    if (!app.guideOpen) return;
    const media = window.matchMedia?.('(max-width: 720px)');
    narrow = !!media?.matches;
    const update = () => (narrow = !!media?.matches);
    media?.addEventListener?.('change', update);
    void tick().then(() => searchInput?.focus());
    return () => media?.removeEventListener?.('change', update);
  });

  function pick(id: string) {
    app.guideTopic = id;
    void tick().then(() => article?.scrollTo?.({ top: 0 }));
  }

  const close = () => {
    app.guideOpen = false;
    query = '';
  };
  const featureOff = (topic: GuideTopic) => !!topic.feature && !app.on(topic.feature as Feature);
  const picture = (topic: GuideTopic) => `${import.meta.env.BASE_URL}guide/${app.lang}/${topic.image!.file}`;

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && app.guideOpen && !app.dialog) {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={keydown} />

{#if app.guideOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="dialog guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div class="shortcuts-head">
        <h2 id="guide-title">{t('guide.title')}</h2>
        <button class="btn ghost" onclick={close}>{t('keys.done')}</button>
      </div>
      <div class="guide-body" class:reading={narrow && !!current}>
        <nav class="guide-nav" aria-label={t('guide.topics')}>
          <input type="search" bind:this={searchInput} bind:value={query} placeholder={t('guide.search')} aria-label={t('guide.search')} />
          {#if shown.length === 0}<p class="rev-empty">{t('guide.none')}</p>{/if}
          <ol>
            {#each shown as topic (topic.id)}
              <li>
                <button class:active={current?.id === topic.id} aria-current={current?.id === topic.id ? 'true' : undefined} onclick={() => pick(topic.id)}>
                  {topic.title}
                  {#if featureOff(topic)}<span class="guide-off-dot" title={t('guide.off')}>●</span>{/if}
                </button>
              </li>
            {/each}
          </ol>
        </nav>
        {#if current}
          <article class="guide-topic" bind:this={article}>
            {#if narrow}<button class="link-btn guide-back" onclick={() => (app.guideTopic = null)}>{t('guide.back')}</button>{/if}
            <h3>{current.title}</h3>
            {#if featureOff(current)}
              <p class="guide-note">
                {t('guide.off')}
                <button class="btn small" onclick={() => app.setFeature(current!.feature as Feature, true)}>{t('guide.turnOn')}</button>
              </p>
            {/if}
            {#if current.image}
              {@const src = picture(current)}
              {#if failed[src]}
                <p class="guide-nopic">{t('guide.noPicture')}</p>
              {:else}
                {#key src}
                  <!-- Opens the picture at full size in a new tab (it is a file of this same site). -->
                  <a class="guide-shot-link" href={src} target="_blank" rel="noopener" title={current.image.alt}>
                    <img class="guide-shot" {src} alt={current.image.alt} decoding="async" onerror={() => (failed[src] = true)} />
                  </a>
                {/key}
              {/if}
            {/if}
            <div class="prose guide-text">{@html html}</div>
            {#if current.try && !featureOff(current)}
              {#if app.canTry(current.try)}
                <p><button class="btn primary" onclick={() => void app.tryGuide(current!.try!)}>{t('guide.try')}</button></p>
              {:else if current.try.kind === 'open' && app.vault}
                <p class="guide-note">{t('guide.tryDemo')}</p>
              {/if}
            {/if}
          </article>
        {/if}
      </div>
    </div>
  </div>
{/if}
