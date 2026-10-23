import { mount } from 'svelte';
import './styles.css';
import App from './App.svelte';
import { migrateBrowserData } from './migrate';

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
    mount(App, { target });
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'boot-error';
    p.textContent = `Exomyth could not start: ${e instanceof Error ? e.message : String(e)}`;
    target.replaceChildren(p);
    throw e;
  }
});
