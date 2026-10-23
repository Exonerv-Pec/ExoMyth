import { app } from './app.svelte';
import { mimeType, type MediaKind } from './core/media';
import type { Vault } from './core/vault';

/**
 * Turns the media placeholders produced by `renderMarkdown` into real <img>, <video> and <audio>
 * elements. Files are read from the world's storage and shown through `blob:` addresses, so
 * nothing is fetched from a server.
 */

const urls = new Map<string, Promise<string>>();
let owner: Vault | null = null;

function revokeAll(): void {
  for (const p of urls.values()) void p.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
  urls.clear();
}

function urlFor(vault: Vault, path: string, mtime: number): Promise<string> {
  if (owner !== vault) {
    revokeAll();
    owner = vault;
  }
  const key = `${path}\u0000${mtime}`;
  let url = urls.get(key);
  if (!url) {
    url = vault.readFile(path).then((bytes) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType(path) })));
    urls.set(key, url);
    url.catch(() => urls.delete(key));
  }
  return url;
}

function mediaElement(kind: MediaKind, url: string, alt: string, width?: number, height?: number): HTMLElement {
  let el: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  if (kind === 'video') {
    el = document.createElement('video');
    el.controls = true;
    el.preload = 'metadata';
  } else if (kind === 'audio') {
    el = document.createElement('audio');
    el.controls = true;
    el.preload = 'metadata';
  } else {
    const img = document.createElement('img');
    img.alt = alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    el = img;
  }
  el.src = url;
  if (alt) el.title = alt;
  if (width) el.style.width = `${width}px`;
  if (height) el.style.height = `${height}px`;
  return el;
}

export function hydrateEmbeds(root: HTMLElement): void {
  const vault = app.vault;
  if (!vault) return;
  for (const holder of root.querySelectorAll<HTMLElement>('.embed[data-embed]:not([data-state])')) {
    const target = holder.dataset.embed ?? '';
    const kind = (holder.dataset.kind ?? 'image') as MediaKind;
    const alt = holder.dataset.alt ?? '';
    const width = Number(holder.dataset.width) || undefined;
    const height = Number(holder.dataset.height) || undefined;
    const file = vault.resolveFile(target);
    if (!file) {
      holder.dataset.state = 'missing';
      holder.classList.add('missing');
      holder.textContent = app.t('media.missing', target);
      continue;
    }
    holder.dataset.state = 'loading';
    urlFor(vault, file.path, file.mtime)
      .then((url) => {
        if (!holder.isConnected) return;
        holder.replaceChildren(mediaElement(kind, url, alt, width, height));
        if (kind === 'audio') {
          const name = document.createElement('span');
          name.className = 'embed-name';
          name.textContent = alt || file.path.slice(file.path.lastIndexOf('/') + 1);
          holder.prepend(name);
        } else if (alt) {
          const caption = document.createElement('span');
          caption.className = 'embed-caption';
          caption.textContent = alt;
          holder.append(caption);
        }
        holder.dataset.state = 'ready';
      })
      .catch(() => {
        holder.dataset.state = 'missing';
        holder.classList.add('missing');
        holder.textContent = app.t('media.missing', target);
      });
  }
}

/** Svelte action: fills in media placeholders now and whenever `dependency` changes. */
export function embeds(node: HTMLElement, _dependency?: unknown) {
  hydrateEmbeds(node);
  return {
    update() {
      hydrateEmbeds(node);
    },
  };
}

/** A `blob:` address for an image (or other media) of the open world, or undefined if it is not there. */
export async function mediaUrl(target: string): Promise<string | undefined> {
  const vault = app.vault;
  if (!vault) return undefined;
  const file = vault.resolveFile(target);
  if (!file) return undefined;
  try {
    return await urlFor(vault, file.path, file.mtime);
  } catch {
    return undefined;
  }
}
