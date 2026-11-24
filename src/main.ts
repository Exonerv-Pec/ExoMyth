import { mount } from 'svelte';
import './styles.css';
import Root from './Root.svelte';
import { migrateBrowserData } from './migrate';
import { pwa } from './pwa.svelte';
import { app } from './app.svelte';
import { isDesktop, startDesktop } from './desktop';

const target = document.getElementById('app')!;

/** Carry over data saved under the project's earlier name, but never let it hold up the start:
 * some browsers (older Safari in particular) can leave a storage request hanging. */
function migrateBriefly(): Promise<void> {
  return Promise.race([migrateBrowserData().catch(() => undefined), new Promise<void>((r) => setTimeout(r, 1500))]);
}

void migrateBriefly().then(() => {
  // Remove the "couldn't start" note that index.html shows if this script never runs.
  target.replaceChildren();
  try {
    mount(Root, { target });
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'boot-error';
    p.textContent = `Exomyth could not start: ${e instanceof Error ? e.message : String(e)}`;
    target.replaceChildren(p);
    throw e;
  }
});

// The desktop app is installed already and keeps no copy of a website.
if (isDesktop) startDesktop();

// Working offline and installing as an app: only in the build made for it.
if (__EXOMYTH_PWA__ && !isDesktop) {
  pwa.start(async () => {
    await app.flush();
    app.rememberForReload();
  });
}
