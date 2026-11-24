<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './app.svelte';
  import { pwa } from './pwa.svelte';
  import Welcome from './components/Welcome.svelte';
  import Workspace from './components/Workspace.svelte';
  import Dialog from './components/Dialog.svelte';
  import HoverPreview from './components/HoverPreview.svelte';
  import Shortcuts from './components/Shortcuts.svelte';
  import Settings from './components/Settings.svelte';
  import ProfilePicker from './components/ProfilePicker.svelte';
  import QuickLookup from './components/QuickLookup.svelte';
  import WritingStats from './components/WritingStats.svelte';
  import VersionCompare from './components/VersionCompare.svelte';
  import Guide from './components/Guide.svelte';
  import MusicHost from './components/MusicHost.svelte';
  import Tour from './components/Tour.svelte';

  let searchInput = $state<HTMLInputElement>();

  // Theme and language are applied on <html> so CSS variables and screen readers see them.
  $effect(() => {
    // "auto" leaves the attribute unset so the system preference (or a host page's own setting) decides.
    if (app.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = app.theme;
    document.documentElement.lang = app.lang;
    document.title = app.vault ? `${app.vault.storage.label} — Exomyth` : 'Exomyth';
  });

  /** Typing into a field or the editor, where a plain "?" is just a character. */
  function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'F1' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // F1: the guide (instead of the browser's own help).
      e.preventDefault();
      if (app.dialog) return;
      if (app.guideOpen) app.guideOpen = false;
      else app.openGuide();
    } else if (((e.ctrlKey || e.metaKey) && (e.code === 'Slash' || e.key === '/')) || (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target))) {
      // Ctrl+/ (anywhere) or "?" (outside text): the list of shortcuts.
      if (app.dialog) return;
      e.preventDefault();
      e.stopPropagation();
      app.shortcutsOpen = !app.shortcutsOpen;
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'Comma' || e.key === ',')) {
      // Ctrl+, : settings.
      if (app.dialog) return;
      e.preventDefault();
      e.stopPropagation();
      app.shortcutsOpen = false;
      app.settingsOpen = !app.settingsOpen;
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'Period' || e.key === '.') && app.vault && !app.dialog && app.on('focusMode')) {
      // Ctrl+. : focus mode on and off.
      e.preventDefault();
      e.stopPropagation();
      app.setFocus(!app.focus);
    } else if (e.key === 'Escape' && app.focus && !app.dialog && !app.shortcutsOpen && !app.hover && !app.lookupOpen) {
      app.setFocus(false);
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k' && app.vault) {
      e.preventDefault();
      if (app.on('quickLookup')) {
        // Ctrl+K: search over whatever is on screen, with a preview, and back to the same place on Esc.
        if (app.dialog || app.shortcutsOpen || app.settingsOpen || app.profilePicker) return;
        app.hoverClose();
        app.lookupOpen = !app.lookupOpen;
      } else {
        app.setFocus(false);
        app.sidebarOpen = true;
        queueMicrotask(() => searchInput?.focus());
      }
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyI' && app.vault && !app.dialog && app.on('quickNotes')) {
      // Alt+I: catch an idea from anywhere, without leaving the page.
      e.preventDefault();
      app.askIdea();
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

<!-- Capture phase: Ctrl+/ must win over the editor, which would toggle a comment. -->
<svelte:window onkeydowncapture={keydown} />

{#if app.vault}
  <Workspace bind:searchInput />
{:else}
  <Welcome />
{/if}

<WritingStats />
<VersionCompare />
<Dialog />
<HoverPreview />
<Shortcuts />
<Guide />
<MusicHost />
<Tour />
<Settings />
<ProfilePicker />
<QuickLookup />

{#if pwa.updateReady}
  <div class="update-bar" role="status">
    <span>{app.t('pwa.update')}</span>
    <button class="btn primary" onclick={() => pwa.update()}>{app.t('pwa.reload')}</button>
  </div>
{/if}

{#if app.toast}
  <div class="toast" class:error={app.toast.error} role="status">{app.toast.text}</div>
{/if}
