<script lang="ts">
  import { app, type Feature } from '../app.svelte';
  import { countPages, type Key } from '../i18n';
  import { featureUsage, type UsedFeature } from '../core/usage';

  const t = app.t;

  interface Item {
    feature: Feature;
    /** Needs another part to be on (e.g. family trees live in Cards). */
    needs?: Feature;
  }
  interface Group {
    title: Key;
    items: Item[];
  }

  const groups: Group[] = [
    { title: 'settings.group.views', items: [{ feature: 'graph' }, { feature: 'cards' }, { feature: 'timeline' }, { feature: 'manuscript' }] },
    { title: 'settings.group.world', items: [{ feature: 'family', needs: 'cards' }, { feature: 'maps' }, { feature: 'years' }] },
    { title: 'settings.group.writing', items: [{ feature: 'wordCount' }, { feature: 'quickNotes' }, { feature: 'focusMode' }] },
    { title: 'settings.group.interface', items: [{ feature: 'relationsPanel' }, { feature: 'hoverPreviews' }] },
  ];

  const name = (f: Feature) => t(`settings.${f}` as Key);
  const about = (f: Feature) => t(`settings.${f}.about` as Key);
  const close = () => (app.settingsOpen = false);
  const allOn = $derived(Object.values(app.features).every(Boolean) && app.spellcheck);

  /** Pages of the open world that each part shows something on. */
  const usage = $derived.by(() => {
    app.version;
    return app.settingsOpen && app.vault ? featureUsage(app.vault.index) : undefined;
  });
  const usedBy = (f: Feature) => usage?.[f as UsedFeature];

  function openPage(path: string) {
    close();
    void app.openText(path);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.settingsOpen && close()} />

{#if app.settingsOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="dialog settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="shortcuts-head">
        <h2 id="settings-title">{t('settings.title')}</h2>
        <button class="btn ghost" onclick={close}>{t('keys.done')}</button>
      </div>
      <div class="settings-body">
        <p class="settings-note">{t('settings.note')}</p>

        {#if app.vault}
          <div class="setting-row profile-row">
            <span>
              <span class="setting-name">{t('profile.label')}</span>
              <span class="setting-about">{app.profile ? t(`profile.${app.profile}` as Key) : t('profile.none')}</span>
            </span>
            <button class="btn" onclick={() => ((app.settingsOpen = false), (app.profilePicker = 'settings'))}>{t('profile.choose')}</button>
          </div>
        {/if}

        {#each groups as g (g.title)}
          <section>
            <h3>{t(g.title)}</h3>
            {#each g.items as item (item.feature)}
              {@const blocked = !!item.needs && !app.on(item.needs)}
              <label class="setting" class:blocked>
                <input
                  type="checkbox"
                  role="switch"
                  checked={app.on(item.feature)}
                  disabled={blocked}
                  onchange={(e) => app.setFeature(item.feature, e.currentTarget.checked)}
                />
                <span class="setting-text">
                  <span class="setting-name">{name(item.feature)}</span>
                  <span class="setting-about">{blocked ? t('settings.needs', name(item.needs!)) : about(item.feature)}</span>
                </span>
              </label>
              {@const used = usedBy(item.feature)}
              {#if used?.length}
                <details class="setting-usage" class:warn={!app.on(item.feature)}>
                  <summary>
                    {app.on(item.feature) ? t('settings.usage.on', countPages(app.lang, used.length)) : t('settings.usage.off', countPages(app.lang, used.length))}
                  </summary>
                  <ul>
                    {#each used as p (p.path)}
                      <li><button type="button" class="link-btn" onclick={() => openPage(p.path)}>{p.title}</button></li>
                    {/each}
                  </ul>
                </details>
              {/if}
            {/each}
            {#if g.title === 'settings.group.writing'}
              <label class="setting">
                <input type="checkbox" role="switch" checked={app.spellcheck} onchange={() => app.toggleSpellcheck()} />
                <span class="setting-text">
                  <span class="setting-name">{t('spell.label')}</span>
                  <span class="setting-about">{t('settings.spell.about')}</span>
                </span>
              </label>
            {/if}
          </section>
        {/each}

        <section>
          <h3>{t('settings.group.look')}</h3>
          <div class="setting-row">
            <span class="setting-name">{t('settings.theme')}</span>
            <div class="seg" role="group" aria-label={t('settings.theme')}>
              {#each ['auto', 'light', 'dark'] as const as th (th)}
                <button aria-pressed={app.theme === th} onclick={() => app.setTheme(th)}>{t(`settings.theme.${th}` as Key)}</button>
              {/each}
            </div>
          </div>
          <div class="setting-row">
            <span class="setting-name">{t('settings.language')}</span>
            <div class="seg" role="group" aria-label={t('settings.language')}>
              <button aria-pressed={app.lang === 'en'} onclick={() => app.setLang('en')}>English</button>
              <button aria-pressed={app.lang === 'ru'} onclick={() => app.setLang('ru')}>Русский</button>
            </div>
          </div>
        </section>

        <div class="settings-foot">
          <button
            class="btn ghost"
            disabled={allOn}
            onclick={() => {
              app.resetFeatures();
              if (!app.spellcheck) app.toggleSpellcheck();
            }}>{t('settings.reset')}</button
          >
        </div>
      </div>
    </div>
  </div>
{/if}
