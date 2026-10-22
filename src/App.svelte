<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './app.svelte';
  import Welcome from './components/Welcome.svelte';
  import Workspace from './components/Workspace.svelte';
  import Dialog from './components/Dialog.svelte';
  import HoverPreview from './components/HoverPreview.svelte';

  let searchInput = $state<HTMLInputElement>();

  // Theme and language are applied on <html> so CSS variables and screen readers see them.
  $effect(() => {
    // "auto" leaves the attribute unset so the system preference (or a host page's own setting) decides.
    if (app.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = app.theme;
    document.documentElement.lang = app.lang;
    document.title = app.vault ? `${app.vault.storage.label} — Exomyth` : 'Exomyth';
  });

  function keydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && app.vault) {
      e.preventDefault();
      app.sidebarOpen = true;
      queueMicrotask(() => searchInput?.focus());
    }
  }

  onMount(() => {
    // Pick up edits made outside the app (another editor, a synced folder) when the window regains focus.
    const onFocus = () => {
      if (app.vault) void app.flush().then(() => app.vault?.refresh()).catch(() => undefined);
    };
    // Save typing that is still waiting for its autosave when the tab is hidden or closed.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void app.flush();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (app.saveStatus === 'dirty' || app.saveStatus === 'saving') {
        void app.flush();
        e.preventDefault();
      }
    };
    // Scrolling anywhere moves links away from their preview card, so close it.
    const onScroll = () => app.hover && app.hoverClose();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('scroll', onScroll, true);
    };
  });
</script>

<svelte:window onkeydown={keydown} />

{#if app.vault}
  <Workspace bind:searchInput />
{:else}
  <Welcome />
{/if}

<Dialog />
<HoverPreview />

{#if app.toast}
  <div class="toast" class:error={app.toast.error} role="status">{app.toast.text}</div>
{/if}
