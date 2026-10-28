import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { buildSite, defaultStartPage, pageFile, relativeHref, siteToZip, sitePages, type SiteOptions } from '../src/core/site';
import { translate } from '../src/i18n';
import { DEMO_FILES, DEMO_MEDIA } from '../src/demo';

async function demo(extra: Record<string, string> = {}) {
  const storage = new MemoryStorage(`site-${Math.random()}`, { ...DEMO_FILES, ...extra });
  for (const [p, data] of Object.entries(DEMO_MEDIA)) await storage.writeBytes(p, data);
  return Vault.open(storage);
}

const options = (o: Partial<SiteOptions> = {}): SiteOptions => ({
  title: 'Silver Coast',
  hiddenTag: 'secret',
  hiddenFolders: [],
  spoilers: 'click',
  start: 'Welcome.md',
  lang: 'en',
  t: (key, ...args) => translate('en', key, ...args),
  ...o,
});

const text = (site: { files: Map<string, Uint8Array> }, path: string) => {
  const data = site.files.get(path);
  if (!data) throw new Error(`no ${path} in ${[...site.files.keys()].join(', ')}`);
  return new TextDecoder().decode(data);
};

const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('links inside the site', () => {
  it('are relative, so the site opens from any folder', () => {
    expect(relativeHref('pages/Characters/Kira Vale.html', 'pages/Characters/Arn Vale.html')).toBe('Arn%20Vale.html');
    expect(relativeHref('pages/Characters/Kira Vale.html', 'pages/Places/Rivertown.html')).toBe('../Places/Rivertown.html');
    expect(relativeHref('pages/Welcome.html', 'index.html')).toBe('../index.html');
    expect(relativeHref('index.html', 'media/attachments/a b.svg')).toBe('media/attachments/a%20b.svg');
    expect(relativeHref('pages/A/B/C.html', 'site.css')).toBe('../../../site.css');
    expect(pageFile('Characters/Kira Vale.md')).toBe('pages/Characters/Kira Vale.html');
  });
});

describe('a world as a static site', () => {
  it('has a page for every world page, a front page and its own two files', async () => {
    const vault = await demo();
    const site = await buildSite(vault, options());
    expect(site.pages).toBe(vault.index.worldPages.length);
    const html = [...site.files.keys()].filter((p) => p.endsWith('.html'));
    // Every page, the book read straight through, and the front page.
    expect(html.length).toBe(site.pages + 2);
    expect(site.files.has('index.html')).toBe(true);
    expect(site.files.has('site.css')).toBe(true);
    expect(site.files.has('site.js')).toBe(true);
    expect(site.files.has('pages/Manuscript/The Silver Thread.book.html')).toBe(true);
    // Nothing of the app's own: no settings, versions or templates.
    expect([...site.files.keys()].some((p) => p.includes('.exomyth'))).toBe(false);
  });

  it('turns links into links between the files', async () => {
    const vault = await demo();
    const site = await buildSite(vault, options());
    const kira = dom(text(site, 'pages/Characters/Kira Vale.html'));
    expect(kira.querySelector('h1')!.textContent).toBe('Kira Vale');
    expect(kira.title).toBe('Kira Vale · Silver Coast');
    const links = [...kira.querySelectorAll<HTMLAnchorElement>('.prose a.wikilink')].map((a) => a.getAttribute('href'));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) expect(href).toMatch(/^(\.\.\/[^/]+\/)?[^/]+\.html(#.*)?$/);
    // No data from the app is left on the links.
    expect(kira.querySelector('[data-target], [data-path]')).toBeNull();
    expect(kira.querySelector('link[rel=stylesheet]')!.getAttribute('href')).toBe('../../site.css');
  });

  it('shows the relations of a page, both ways', async () => {
    const vault = await demo();
    const site = await buildSite(vault, options());
    const kira = dom(text(site, 'pages/Characters/Kira Vale.html'));
    const related = kira.querySelector('.related')!;
    expect(related.textContent).toContain('Relations');
    expect(related.textContent).toContain('Arn Vale');
    const arn = dom(text(site, 'pages/Characters/Arn Vale.html'));
    expect(arn.querySelector('.related')!.textContent).toContain('Kira Vale');
  });

  it('copies the pictures and sounds the pages use, and only those', async () => {
    const vault = await demo();
    const site = await buildSite(vault, options());
    const media = [...site.files.keys()].filter((p) => p.startsWith('media/')).sort();
    expect(media).toContain('media/attachments/silver coast.svg');
    expect(media).toContain('media/attachments/Dawn over the river.wav');
    expect(site.media).toBe(media.length);
    const map = dom(text(site, 'pages/Maps/Silver Coast.html'));
    expect(map.querySelector('.map-image')!.getAttribute('src')).toBe('../../media/attachments/silver%20coast.svg');
    const pins = [...map.querySelectorAll<HTMLAnchorElement>('a.pin')];
    expect(pins.map((p) => p.textContent)).toContain('Rivertown');
    expect(pins.find((p) => p.textContent === 'Rivertown')!.getAttribute('href')).toBe('../Places/Rivertown.html');
    const music = dom(text(site, 'pages/Music/Rivertown Evening.html'));
    expect(music.querySelectorAll('.tracks audio').length).toBe(3);
  });

  it('draws mood boards and calendars', async () => {
    const vault = await demo();
    const site = await buildSite(vault, options());
    const board = dom(text(site, 'pages/Boards/The Look of Rivertown.html'));
    expect(board.querySelectorAll('.board .b-item').length).toBeGreaterThan(3);
    const cal = dom(text(site, 'pages/World/Calendar of the Coast.html'));
    expect(cal.querySelector('.cal-months')!.textContent).toContain('The Long Night');
  });

  it('leaves out comments and suggested changes', async () => {
    const vault = await demo();
    const site = await buildSite(vault, options());
    const market = text(site, 'pages/Scenes/The Market.html');
    expect(market).not.toContain('critic');
    expect(market).not.toContain('{~~');
    expect(market).toContain('at once');
  });

  it('keeps spoilers hidden until clicked, or leaves them out', async () => {
    const vault = await demo();
    const click = await buildSite(vault, options());
    expect(dom(text(click, 'pages/Characters/Kira Vale.html')).querySelector('.spoiler')!.textContent).toBe('Eva Crow is her half-sister');
    const removed = await buildSite(vault, options({ spoilers: 'remove' }));
    const kira = text(removed, 'pages/Characters/Kira Vale.html');
    expect(kira).not.toContain('half-sister');
  });

  it('leaves out pages with the hidden tag or in hidden folders, and every trace of them', async () => {
    const vault = await demo({
      'Characters/The Masked One.md': '---\ntags: [Secret]\n---\nThe masked one is [[Dax Morn]].\n',
      'Characters/Dax Morn.md': `${DEMO_FILES['Characters/Dax Morn.md']}\nHe answers to [[The Masked One]].\n`,
    });
    const site = await buildSite(vault, options({ hiddenFolders: ['Scenes'] }));
    expect(site.files.has('pages/Characters/The Masked One.html')).toBe(false);
    expect([...site.files.keys()].some((p) => p.startsWith('pages/Scenes/'))).toBe(false);
    const dax = dom(text(site, 'pages/Characters/Dax Morn.html'));
    // The words of the link stay, without a link to the page that is not there.
    expect(dax.querySelector('.prose')!.textContent).toContain('He answers to The Masked One');
    expect([...dax.querySelectorAll('a')].some((a) => a.textContent === 'The Masked One')).toBe(false);
    // Not among the pages that mention Dax either.
    expect(dax.querySelector('.related')?.textContent ?? '').not.toContain('Masked');
    expect(text(site, 'index.html')).not.toContain('Masked');
    // The book only reads the scenes that are on the site.
    expect(dom(text(site, 'pages/Manuscript/The Silver Thread.book.html')).querySelectorAll('.scene-title').length).toBe(0);
    expect(sitePages(vault.index, { hiddenTag: '#secret', hiddenFolders: [] }).some((p) => p.name === 'The Masked One')).toBe(false);
  });

  it('lists every page on the front page, after the start page', async () => {
    const vault = await demo();
    expect(defaultStartPage(vault.index)).toBe('Welcome.md');
    const site = await buildSite(vault, options());
    const front = dom(text(site, 'index.html'));
    // The start page's own heading is the title of the front page.
    expect(front.querySelector('h1')!.textContent).toBe('Welcome to Exomyth');
    expect(front.querySelectorAll('h1').length).toBe(1);
    expect(front.querySelector('.prose')!.textContent).toContain('This is a demo world');
    expect(front.querySelectorAll('.all-pages li').length).toBe(site.pages);
    expect(front.querySelector('.all-pages a[href="pages/Characters/Kira%20Vale.html"]')).not.toBeNull();
    const none = dom(text(await buildSite(vault, options({ start: '' })), 'index.html'));
    expect(none.querySelector('.prose')).toBeNull();
    expect(none.querySelector('h1')!.textContent).toBe('Silver Coast');
  });

  it('never points at anything outside the site', async () => {
    const vault = await demo({ 'Places/Far.md': '![](https://example.com/a.png) [[Nowhere]] <script>alert(1)</script> <img src="https://example.com/b.png" srcset="https://example.com/c.png 2x"> <svg><image href="https://example.com/d.png"></image></svg> <video poster="https://example.com/e.png"></video>' });
    const site = await buildSite(vault, options());
    for (const [path, data] of site.files) {
      if (!path.endsWith('.html')) continue;
      const doc = dom(new TextDecoder().decode(data));
      expect(doc.querySelectorAll('script:not([src])').length, path).toBe(0);
      for (const el of doc.querySelectorAll('*')) {
        for (const attr of el.attributes) {
          if (el.tagName === 'A' && attr.name === 'href') continue;
          expect(attr.value, `${path} ${el.tagName} ${attr.name}`).not.toMatch(/(https?:)?\/\/example/i);
        }
      }
      for (const el of doc.querySelectorAll('link[href]')) expect(el.getAttribute('href'), path).not.toMatch(/^[a-z]+:/i);
    }
    const far = dom(text(site, 'pages/Places/Far.html'));
    expect(far.querySelector('.prose')!.textContent).toContain('Nowhere');
    expect(far.querySelector('a.external-media')!.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('packs the site into a .zip with one folder', async () => {
    const vault = await demo();
    const site = await buildSite(vault, options());
    const zip = unzipSync(siteToZip(site, 'Silver Coast - site'));
    expect(Object.keys(zip).every((p) => p.startsWith('Silver Coast - site/'))).toBe(true);
    expect(strFromU8(zip['Silver Coast - site/index.html']!)).toContain('<!doctype html>');
  });
});
