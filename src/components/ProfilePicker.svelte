<script lang="ts">
  import { app, FEATURES, type Feature } from '../app.svelte';
  import { PROFILES, type ProfileId } from '../core/profiles';
  import type { Key } from '../i18n';

  const t = app.t;
  let starter = $state(true);

  // From Settings, starting pages are only offered as an option (off by default).
  $effect(() => {
    starter = app.profilePicker === 'new';
  });

  const featureName = (f: string) => t(`settings.${f}` as Key);
  const onFor = (off: string[]) => FEATURES.filter((f: Feature) => !off.includes(f) && ['graph', 'cards', 'timeline', 'manuscript', 'family', 'maps'].includes(f));

  function choose(id: ProfileId) {
    void app.applyProfile(id, starter);
  }

  function skip() {
    app.profilePicker = null;
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.profilePicker && skip()} />

{#if app.profilePicker}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && skip()}>
    <div class="dialog profiles" role="dialog" aria-modal="true" aria-labelledby="profiles-title">
      <div class="shortcuts-head">
        <h2 id="profiles-title">{t('profile.title')}</h2>
        <button class="btn ghost" onclick={skip}>{app.profilePicker === 'new' ? t('profile.skip') : t('keys.done')}</button>
      </div>
      <div class="profiles-body">
        <p class="settings-note">{app.profilePicker === 'new' ? t('profile.intro') : t('profile.introSettings')}</p>
        <div class="profile-grid">
          {#each PROFILES as p (p.id)}
            <button class="profile-card" class:current={app.profile === p.id} onclick={() => choose(p.id)}>
              <span class="pf-emoji" aria-hidden="true">{p.emoji}</span>
              <span class="pf-name">{t(`profile.${p.id}` as Key)}</span>
              <span class="pf-about">{t(`profile.${p.id}.about` as Key)}</span>
              <span class="pf-chips">
                {#each onFor(p.off) as f (f)}<span class="chip">{featureName(f)}</span>{/each}
              </span>
            </button>
          {/each}
        </div>
        <label class="tool-check pf-starter"><input type="checkbox" bind:checked={starter} /> {t('profile.starter')}</label>
        <p class="settings-note">{t('profile.note')}</p>
      </div>
    </div>
  </div>
{/if}
