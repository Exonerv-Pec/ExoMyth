import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Dialog from '../src/components/Dialog.svelte';
import Sidebar from '../src/components/Sidebar.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { DEMO_FILES } from '../src/demo';

let mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.closeVault();
  vi.restoreAllMocks();
});

async function boot() {
  app.lang = 'en';
  app.setVault(await Vault.open(new MemoryStorage(`site-ui-${Math.random()}`, DEMO_FILES)));
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(Sidebar, { target }), mount(Dialog, { target: document.body }));
  flushSync();
  return target;
}

describe('the site window', () => {
  it('opens from the sidebar, counts the pages and makes the site with the choices', async () => {
    const target = await boot();
    const save = vi.spyOn(app, 'downloadSite').mockResolvedValue();
    target.querySelector<HTMLButtonElement>('button[aria-label="Site for readers"]')!.click();
    flushSync();
    const dialog = document.querySelector<HTMLElement>('.site-form')!;
    const total = app.vault!.index.worldPages.length;
    expect(dialog.querySelector('.site-count')!.textContent).toBe(`${total} of ${total} pages go on the site`);
    expect(dialog.querySelector<HTMLSelectElement>('select')!.value).toBe('Welcome.md');

    // Leave out the scenes and the spoilers.
    const scenes = [...dialog.querySelectorAll<HTMLLabelElement>('.site-folders label')].find((l) => l.textContent!.trim() === 'Scenes')!;
    scenes.querySelector('input')!.click();
    [...dialog.querySelectorAll<HTMLButtonElement>('[role=radio]')].find((b) => b.textContent === 'Leave them out')!.click();
    flushSync();
    expect(dialog.querySelector('.site-count')!.textContent).toBe(`${total - 4} of ${total} pages go on the site`);

    dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    flushSync();
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith({ title: app.vault!.storage.label, hiddenTag: 'secret', hiddenFolders: ['Scenes'], spoilers: 'remove', start: 'Welcome.md' });
    expect(document.querySelector('.site-form')).toBeNull();
  });

  it('has no button when the part is switched off', async () => {
    app.setFeature('siteExport', false);
    try {
      const target = await boot();
      expect(target.querySelector('button[aria-label="Site for readers"]')).toBeNull();
    } finally {
      app.setFeature('siteExport', true);
    }
  });

  it('saves a .zip of the site', async () => {
    await boot();
    let saved: Blob | undefined;
    URL.createObjectURL = (b: Blob | MediaSource) => ((saved = b as Blob), 'blob:site');
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await app.downloadSite({ title: 'Coast', hiddenTag: 'secret', hiddenFolders: [], spoilers: 'click', start: 'Welcome.md' });
    expect(click).toHaveBeenCalled();
    expect(saved!.type).toBe('application/zip');
    expect(saved!.size).toBeGreaterThan(1000);
  });
});
