<script lang="ts">
  import { onMount } from 'svelte';
  import { app, readBytes } from '../app.svelte';
  import { readWorldZip, uniqueName, worldNameFromZip, ZipTooLargeError } from '../core/archive';
  import { Vault } from '../core/vault';
  import {
    BrowserStorage,
    FolderStorage,
    MemoryStorage,
    deleteBrowserVault,
    listBrowserVaults,
    type VaultStorage,
  } from '../core/storage';
  import { sanitizePageName } from '../core/names';
  import { ensureReadWrite, forgetFolder, listFolders, rememberFolder, type SavedFolder } from '../handles';
  import { DEMO_FILES, DEMO_MEDIA, DEMO_WORLD_NAME, updateDemoWorld } from '../demo';

  const t = app.t;
  // Browsers refuse the folder picker inside an embedded frame, so say so instead of failing on click.
  const inFrame = typeof window !== 'undefined' && window.self !== window.top;
  const hasFolderAccess = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && !inFrame;

  let folders = $state<SavedFolder[]>([]);
  let browserWorlds = $state<string[]>([]);
  /** Browser worlds holding the Russian demo that versions before 0.2.1 created as "Demo". */
  let legacyDemos = $state<Set<string>>(new Set());
  let newName = $state('');
  let error = $state('');
  let busy = $state(false);

  async function loadLists() {
    folders = hasFolderAccess ? await listFolders() : [];
    browserWorlds = await listBrowserVaults().catch(() => []);
    const legacy = new Set<string>();
    for (const w of browserWorlds) {
      if (w !== 'Demo') continue;
      try {
        if (await new BrowserStorage(w).exists('Добро пожаловать.md')) legacy.add(w);
      } catch {
        /* Not readable: just list it normally. */
      }
    }
    legacyDemos = legacy;
  }

  function askDelete(name: string) {
    app.dialog = {
      kind: 'confirm',
      title: app.t('welcome.delete.title', name),
      message: app.t('welcome.delete.text'),
      confirmLabel: app.t('welcome.delete.confirm'),
      danger: true,
      onConfirm: async () => {
        try {
          await deleteBrowserVault(name);
          app.notify(app.t('welcome.deleted', name));
        } catch (e) {
          fail(e);
        }
        await loadLists();
      },
    };
  }
  onMount(loadLists);

  function fail(e: unknown) {
    error = app.t('welcome.error', e instanceof Error ? e.message : String(e));
    busy = false;
  }

  async function openFolderHandle(handle: FileSystemDirectoryHandle) {
    error = '';
    if (!(await ensureReadWrite(handle))) {
      error = app.t('welcome.permission');
      return;
    }
    busy = true;
    const vault = await Vault.open(new FolderStorage(handle));
    await rememberFolder(handle);
    app.setVault(vault);
  }

  async function pickFolder() {
    try {
      const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
      await openFolderHandle(handle);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      fail(e);
    }
  }

  async function openSaved(f: SavedFolder) {
    try {
      await openFolderHandle(f.handle);
    } catch (e) {
      fail(e);
    }
  }

  /** Browser storage, or a temporary in-memory world when the browser refuses to store anything. */
  async function browserStorage(name: string): Promise<VaultStorage> {
    try {
      const storage = new BrowserStorage(name);
      await storage.list();
      return storage;
    } catch {
      app.notify(app.t('welcome.memory'), true);
      return new MemoryStorage(name);
    }
  }

  /** A demo saved by an earlier version gets the new demo files; the owner's edits are kept. */
  async function refreshDemo(storage: VaultStorage) {
    const n = await updateDemoWorld(storage);
    if (n > 0) app.notify(app.t('welcome.demoUpdated', n));
  }

  async function openBrowserWorld(name: string) {
    try {
      busy = true;
      const storage = await browserStorage(name);
      if (name === DEMO_WORLD_NAME) await refreshDemo(storage);
      app.setVault(await Vault.open(storage));
    } catch (e) {
      fail(e);
    }
  }

  async function createWorld(e: SubmitEvent) {
    e.preventDefault();
    const name = sanitizePageName(newName);
    if (!name) return;
    await openBrowserWorld(name);
  }

  async function openDemo() {
    try {
      busy = true;
      const storage = await browserStorage(DEMO_WORLD_NAME);
      if ((await storage.list()).length === 0) {
        for (const [path, text] of Object.entries(DEMO_FILES)) await storage.writeText(path, text);
        for (const [path, data] of Object.entries(DEMO_MEDIA)) await storage.writeBytes(path, data);
      } else {
        await refreshDemo(storage);
      }
      app.setVault(await Vault.open(storage));
    } catch (e) {
      fail(e);
    }
  }

  let zipInput = $state<HTMLInputElement>();

  /** Opens a world saved as a .zip: it becomes a new world in this browser. */
  async function openZip(file: File) {
    error = '';
    busy = true;
    let parsed: ReturnType<typeof readWorldZip>;
    try {
      parsed = readWorldZip(await readBytes(file));
    } catch (e) {
      error = e instanceof ZipTooLargeError ? t('zip.tooLarge') : t('zip.bad', e instanceof Error ? e.message : String(e));
      busy = false;
      return;
    }
    if (![...parsed.files.keys()].some((p) => p.toLowerCase().endsWith('.md'))) {
      error = t('zip.empty');
      busy = false;
      return;
    }
    try {
      const taken = await listBrowserVaults().catch(() => browserWorlds);
      const name = uniqueName(sanitizePageName(worldNameFromZip(file.name)) || 'World', taken);
      const storage = await browserStorage(name);
      for (const [path, data] of parsed.files) await storage.writeBytes(path, data);
      app.setVault(await Vault.open(storage));
      app.notify(
        t('zip.opened', name, parsed.files.size) + (parsed.skipped ? `. ${t('zip.skipped', parsed.skipped)}` : ''),
        parsed.skipped > 0,
      );
    } catch (e) {
      fail(e);
    }
  }

  async function forget(f: SavedFolder) {
    await forgetFolder(f.id);
    await loadLists();
  }
</script>

<main class="welcome">
  <div>
    <h1>{t('app.name')}</h1>
    <p class="tagline">{t('welcome.tagline')}</p>

    {#if hasFolderAccess}
      <section>
        <button class="btn primary" onclick={pickFolder} disabled={busy}>{t('welcome.open')}</button>
        <p class="hint">{t('welcome.open.hint')}</p>
        {#if folders.length > 0}
          <h2 style="margin-top:1rem">{t('welcome.recent')}</h2>
          <ul class="world-list">
            {#each folders as f (f.id)}
              <li>
                <button class="world" onclick={() => openSaved(f)}>{f.name}</button>
                <button class="icon-btn" title={t('welcome.forget')} aria-label={t('welcome.forget')} onclick={() => forget(f)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
      <section>
        <p class="hint" style="margin:0">{inFrame ? t('welcome.frame') : t('welcome.nofs')}</p>
      </section>
    {/if}

    <section>
      <form class="row" onsubmit={createWorld}>
        <label class="sr-only" for="new-world">{t('welcome.create')}</label>
        <input id="new-world" type="text" placeholder={t('welcome.create.placeholder')} bind:value={newName} />
        <button class="btn" type="submit" disabled={busy || !sanitizePageName(newName)}>{t('welcome.create.button')}</button>
      </form>
      <p class="hint">{t('welcome.create')}</p>
      {#if browserWorlds.length > 0}
        <h2 style="margin-top:1rem">{t('welcome.browser')}</h2>
        <ul class="world-list">
          {#each browserWorlds as w (w)}
            <li>
              <button class="world" onclick={() => openBrowserWorld(w)}>
                {w}{#if legacyDemos.has(w)}<span class="world-note"> · {t('welcome.legacyDemo')}</span>{/if}
              </button>
              <button class="icon-btn" title={t('welcome.delete')} aria-label="{t('welcome.delete')}: {w}" onclick={() => askDelete(w)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <button class="btn" onclick={() => zipInput?.click()} disabled={busy}>{t('zip.open')}</button>
      <input
        bind:this={zipInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        onchange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          input.value = '';
          if (file) void openZip(file);
        }}
      />
      <p class="hint">{t('zip.open.hint')}</p>
    </section>

    <section>
      <button class="btn" onclick={openDemo} disabled={busy}>{t('welcome.demo')}</button>
      <p class="hint">{t('welcome.demo.hint')}</p>
    </section>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <p class="privacy">{t('welcome.privacy')}</p>
    <p class="privacy">
      <button class="btn ghost" onclick={() => app.toggleLang()}>{t('lang.switch')}</button>
      <button class="btn ghost" onclick={() => app.cycleTheme()}>{t(`theme.${app.theme}` as 'theme.auto')}</button>
    </p>
  </div>

  <svg class="welcome-art" viewBox="0 0 360 320" fill="none" stroke="currentColor" aria-hidden="true">
    <g stroke-width="1.5" opacity="0.55">
      <path d="M60 70 L170 120 L290 60" />
      <path d="M170 120 L120 230 L250 250" />
      <path d="M290 60 L320 170 L250 250" />
      <path d="M60 70 L50 190 L120 230" />
    </g>
    <g stroke-width="2" fill="var(--surface)">
      <circle cx="170" cy="120" r="14" />
      <circle cx="60" cy="70" r="8" />
      <circle cx="290" cy="60" r="8" />
      <circle cx="120" cy="230" r="9" />
      <circle cx="250" cy="250" r="8" />
      <circle cx="320" cy="170" r="7" />
      <circle cx="50" cy="190" r="7" />
    </g>
    <circle cx="170" cy="120" r="5" fill="currentColor" stroke="none" />
  </svg>
</main>
