import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { renderMarkdown } from '../src/core/render';
import { mediaKind, parseEmbedOptions } from '../src/core/media';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';
import { app } from '../src/app.svelte';
import { hydrateEmbeds } from '../src/embeds';

const index = new VaultIndex([parsePage('Map.md', '', 1)]);
const render = (md: string) => {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(md, index);
  return div;
};

beforeAll(() => {
  let n = 0;
  URL.createObjectURL = () => `blob:test/${++n}`;
  URL.revokeObjectURL = () => {};
});
afterEach(() => app.closeVault());

describe('media in pages', () => {
  it('knows which files are images, video and audio', () => {
    expect(mediaKind('a/B.PNG')).toBe('image');
    expect(mediaKind('clip.webm')).toBe('video');
    expect(mediaKind('theme.mp3')).toBe('audio');
    expect(mediaKind('notes.md')).toBeUndefined();
    expect(parseEmbedOptions('300')).toEqual({ width: 300 });
    expect(parseEmbedOptions('300x200')).toEqual({ width: 300, height: 200 });
    expect(parseEmbedOptions('The old map')).toEqual({ caption: 'The old map' });
  });

  it('renders ![[file]] embeds as placeholders with size and caption', () => {
    const div = render('![[map.png|400]] and ![[intro.mp4|Opening scene]]\n\n![[theme.mp3]]');
    const [img, video, audio] = [...div.querySelectorAll<HTMLElement>('.embed')];
    expect(img!.dataset).toMatchObject({ embed: 'map.png', kind: 'image', width: '400' });
    expect(video!.dataset).toMatchObject({ embed: 'intro.mp4', kind: 'video', alt: 'Opening scene' });
    expect(audio!.dataset).toMatchObject({ embed: 'theme.mp3', kind: 'audio' });
  });

  it('treats ![[Page]] of a page as a link, not as a broken file', () => {
    const div = render('![[Map]]');
    expect(div.querySelector('a.wikilink')!.getAttribute('data-path')).toBe('Map.md');
    expect(div.querySelector('.embed')).toBeNull();
  });

  it('embeds standard Markdown images of the world, but never loads images from the web', () => {
    const div = render('![Old map](attachments/old%20map.png) ![Logo](https://example.com/logo.png)');
    expect(div.querySelector<HTMLElement>('.embed')!.dataset.embed).toBe('attachments/old map.png');
    const external = div.querySelector('a.external-media')!;
    expect(external.getAttribute('href')).toBe('https://example.com/logo.png');
    expect(div.querySelector('img')).toBeNull();
  });

  it('strips raw HTML video and audio tags, which could load from elsewhere', () => {
    const div = render('<video src="https://example.com/v.mp4"></video><audio src="x.mp3"></audio>');
    expect(div.querySelector('video, audio')).toBeNull();
  });
});

describe('attachments in a world', () => {
  it('saves files into attachments/ with names unique across the world', async () => {
    const storage = new MemoryStorage('t', { 'A.md': '', 'Maps/map.png': 'x' });
    const vault = await Vault.open(storage);
    const p1 = await vault.saveAttachment('map.png', new Uint8Array([1, 2]));
    const p2 = await vault.saveAttachment('map.png', new Uint8Array([3]));
    const p3 = await vault.saveAttachment('My: map?.png', new Uint8Array([4]));
    expect([p1, p2, p3]).toEqual(['attachments/map 2.png', 'attachments/map 3.png', 'attachments/My map.png']);
    expect([...(await storage.readBytes(p1))]).toEqual([1, 2]);
    // Attachments are files of the world, not pages.
    expect(vault.pages.map((p) => p.path)).toEqual(['A.md']);
  });

  it('finds a file by name, path ending or full path, preferring the shallowest', async () => {
    const vault = await Vault.open(new MemoryStorage('t', { 'deep/er/x.png': '1', 'top/x.png': '2', 'A.md': '' }));
    expect(vault.resolveFile('x.png')?.path).toBe('top/x.png');
    expect(vault.resolveFile('er/X.PNG')?.path).toBe('deep/er/x.png');
    expect(vault.resolveFile('./top/x.png')?.path).toBe('top/x.png');
    expect(vault.resolveFile('nope.png')).toBeUndefined();
  });

  it('adds dropped or pasted files and returns the embeds to insert', async () => {
    const vault = await Vault.open(new MemoryStorage('t', { 'A.md': '' }));
    app.lang = 'en';
    app.setVault(vault);
    const text = await app.addMedia([
      new File([new Uint8Array([1])], 'portrait.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([2])], 'notes.txt', { type: 'text/plain' }),
      new File([new Uint8Array([3])], 'recording', { type: 'audio/ogg' }),
    ]);
    expect(text).toBe('![[portrait.jpg]]\n![[recording.ogg]]');
    expect(vault.resolveFile('recording.ogg')?.path).toBe('attachments/recording.ogg');
    expect(app.toast?.text).toContain('notes.txt');
  });

  it('turns placeholders into images, video and audio read from the world', async () => {
    const vault = await Vault.open(
      new MemoryStorage('t', { 'A.md': '', 'attachments/map.png': 'p', 'attachments/intro.mp4': 'v', 'attachments/theme.mp3': 'a' }),
    );
    app.setVault(vault);
    const div = render('![[map.png|320]] ![[intro.mp4]] ![[theme.mp3]] ![[lost.png]]');
    document.body.append(div);
    hydrateEmbeds(div);
    await new Promise((r) => setTimeout(r, 20));
    const img = div.querySelector('img')!;
    expect(img.getAttribute('src')).toMatch(/^blob:/);
    expect(img.style.width).toBe('320px');
    expect(div.querySelector('video')!.controls).toBe(true);
    expect(div.querySelector('audio')).toBeTruthy();
    expect(div.querySelector('.embed.missing')!.textContent).toContain('lost.png');
    div.remove();
  });
});
