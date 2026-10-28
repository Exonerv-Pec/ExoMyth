/**
 * A world as a static website, for players and readers: plain HTML pages that open in any browser,
 * straight from the unpacked folder or from any web host, without Exomyth and without the editor.
 *
 * The site holds only what readers should see: the pages (without templates, comments, suggested
 * changes or pages left out), the pictures and sounds those pages show, and two small files of our
 * own (site.css, site.js). Nothing on it loads anything from the network.
 *
 *   index.html            the start page and the list of every page
 *   pages/<path>.html      one file per page, in the world's folders
 *   media/<path>           the pictures, video and sound the pages use
 */
import { zipSync, type Zippable } from 'fflate';
import type { Key } from '../i18n';
import type { VaultIndex } from './index';
import type { FileEntry, Page } from './types';
import { renderMarkdown, headingSlug } from './render';
import { pageFacts } from './preview';
import { pageImage } from './cards';
import { mapOf, type MapModel } from './maps';
import { boardHeight, boardOf, cleanColor, inkOn, isBoard } from './board';
import { isPlaylist, parsePlaylist, withoutTracks } from './playlist';
import { isBook, parseBook, sceneText } from './manuscript';
import { calendarOf, daysInYear } from './calendar';
import { mediaKind } from './media';
import { zipFolderName } from './archive';

export interface SiteOptions {
  /** The name over every page. */
  title: string;
  /** Pages with this tag are left out (`#` and case do not matter). Empty: none. */
  hiddenTag: string;
  /** Top-level folders left out; `''` stands for the pages outside any folder. */
  hiddenFolders: readonly string[];
  /** Spoilers open when clicked, or are left out of the site. */
  spoilers: 'click' | 'remove';
  /** The page shown on the front page, if any. */
  start?: string;
  /** The language of the site, for `<html lang>`. */
  lang: string;
  /** Words of the interface (the app's own translations). */
  t: (key: Key, ...args: (string | number)[]) => string;
}

/** Where the pages and their files come from: the open world. */
export interface SiteSource {
  index: VaultIndex;
  resolveFile(target: string): FileEntry | undefined;
  readFile(path: string): Promise<Uint8Array>;
}

export interface Site {
  /** Every file of the site by its path inside the site. */
  files: Map<string, Uint8Array>;
  pages: number;
  media: number;
}

/** The top-level folder of a page, or `''` outside folders. */
export function topFolder(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

const tagOf = (s: string) => s.trim().replace(/^#/, '').toLocaleLowerCase();

/** The pages that go on the site, in the order of the world. */
export function sitePages(index: VaultIndex, options: Pick<SiteOptions, 'hiddenTag' | 'hiddenFolders'>): Page[] {
  const tag = tagOf(options.hiddenTag);
  const folders = new Set(options.hiddenFolders);
  return index.worldPages.filter((p) => !folders.has(topFolder(p.path)) && !(tag && p.tags.some((t) => tagOf(t) === tag)));
}

/** A front page for a world: one called Welcome (or the like) at the top, or else the first page there. */
export function defaultStartPage(index: VaultIndex): string | undefined {
  const root = index.worldPages.filter((p) => !p.path.includes('/'));
  const named = root.find((p) => /^(welcome|start|start here|index|readme|home|добро пожаловать|с чего начать|главная)\b/i.test(p.name));
  return (named ?? root[0])?.path;
}

/** Where a page lives on the site. */
export function pageFile(path: string): string {
  return `pages/${path.replace(/\.md$/i, '')}.html`;
}

/** The reading of a book, next to its page. */
function bookFile(path: string): string {
  return `pages/${path.replace(/\.md$/i, '')}.book.html`;
}

/** A link from one file of the site to another, relative, so the site works from any folder. */
export function relativeHref(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array<string>(a.length - i).fill('..'), ...b.slice(i).map((s) => encodeURIComponent(s))].join('/');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A number for a style: finite and inside the bounds, rounded. */
function num(n: number, min: number, max: number): string {
  const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  return String(Math.round(v * 1000) / 1000);
}

/** The page's own first heading is not repeated when it only says the page title again. */
function withoutTitleHeading(body: string, title: string): string {
  const m = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(\r?\n|$)/.exec(body);
  return m && m[1]!.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase() ? body.slice(m[0].length) : body;
}

class Builder {
  readonly files = new Map<string, Uint8Array>();
  /** World file path → site path, for the media to copy. */
  private readonly media = new Map<string, string>();
  private readonly included: Set<string>;
  private readonly enc = new TextEncoder();

  constructor(
    private readonly source: SiteSource,
    private readonly options: SiteOptions,
    readonly pages: Page[],
  ) {
    this.included = new Set(pages.map((p) => p.path));
  }

  private t(key: Key, ...args: (string | number)[]): string {
    return this.options.t(key, ...args);
  }

  /** The site path of a world file a page shows, which is then copied; undefined when it is missing. */
  private mediaFile(target: string): string | undefined {
    const file = this.source.resolveFile(target);
    if (!file) return undefined;
    let out = this.media.get(file.path);
    if (!out) {
      out = `media/${file.path}`;
      this.media.set(file.path, out);
    }
    return out;
  }

  /** A link to a page of the site, or undefined when the page is not on it. */
  private pageHref(from: string, target: string, heading?: string): string | undefined {
    const page = this.source.index.get(target) ?? this.source.index.resolve(target);
    if (!page || !this.included.has(page.path)) return undefined;
    return relativeHref(from, pageFile(page.path)) + (heading ? `#${encodeURIComponent(headingSlug(heading))}` : '');
  }

  /** Rendered Markdown made fit for the site: links, pictures and spoilers. */
  html(markdown: string, from: string): string {
    const raw = renderMarkdown(markdown, this.source.index, { comments: false });
    const tpl = document.createElement('template');
    tpl.innerHTML = raw;
    const root = tpl.content;
    // HTML written in a page: the app's own rules stop it loading anything from elsewhere; on
    // the site nothing else would, so pictures from other sites become links, as in Markdown.
    for (const el of root.querySelectorAll('*')) {
      const local = el.closest('.embed[data-embed]');
      for (const attr of ['srcset', 'poster', 'xlink:href', 'background']) el.removeAttribute(attr);
      if (el.tagName !== 'A' && el.hasAttribute('href')) el.removeAttribute('href');
      const src = el.getAttribute('src');
      if (src === null || local) continue;
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src.trim())) {
        const a = document.createElement('a');
        a.className = 'external-media';
        a.href = src;
        a.textContent = el.getAttribute('alt') || src;
        el.replaceWith(a);
      } else {
        const file = this.mediaFile(src.replace(/^\.?\//, ''));
        if (file) el.setAttribute('src', relativeHref(from, file));
        else el.removeAttribute('src');
      }
    }
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a.wikilink')) {
      const href = a.dataset.path ? this.pageHref(from, a.dataset.path, a.dataset.heading) : undefined;
      if (!href) {
        // A page that is not on the site: its words stay, without a link.
        a.replaceWith(document.createTextNode(a.textContent ?? ''));
        continue;
      }
      a.setAttribute('href', href);
      a.className = 'wikilink';
      for (const k of ['target', 'path', 'heading']) delete a.dataset[k];
    }
    for (const holder of root.querySelectorAll<HTMLElement>('.embed[data-embed]')) holder.replaceWith(this.embed(holder, from));
    if (this.options.spoilers === 'remove') for (const s of root.querySelectorAll('.spoiler')) s.remove();
    // Links to other sites tell them nothing about where the reader came from.
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) a.setAttribute('rel', 'noopener noreferrer');
    const div = document.createElement('div');
    div.append(root);
    return div.innerHTML;
  }

  /** A picture, video or sound of the world in place of the renderer's placeholder. */
  private embed(holder: HTMLElement, from: string): HTMLElement {
    const target = holder.dataset.embed ?? '';
    const kind = mediaKind(target) ?? 'image';
    const alt = holder.dataset.alt ?? '';
    const width = Number(holder.dataset.width) || undefined;
    const height = Number(holder.dataset.height) || undefined;
    const file = this.mediaFile(target);
    const box = document.createElement('span');
    box.className = `embed embed-${kind}`;
    if (!file) {
      box.className += ' missing';
      box.textContent = target;
      return box;
    }
    const src = relativeHref(from, file);
    let el: HTMLElement;
    if (kind === 'image') {
      const img = document.createElement('img');
      img.alt = alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      el = img;
    } else {
      const media = document.createElement(kind);
      media.controls = true;
      media.preload = 'metadata';
      el = media;
    }
    el.setAttribute('src', src);
    if (width) el.setAttribute('width', String(Math.round(width)));
    if (height) el.setAttribute('height', String(Math.round(height)));
    if (kind === 'audio') {
      const name = document.createElement('span');
      name.className = 'embed-name';
      name.textContent = alt || target.slice(target.lastIndexOf('/') + 1);
      box.append(name);
    }
    box.append(el);
    if (alt && kind !== 'audio') {
      const caption = document.createElement('span');
      caption.className = 'embed-caption';
      caption.textContent = alt;
      box.append(caption);
    }
    return box;
  }

  /** One short piece of Markdown (a fact) without its paragraph. */
  private inline(markdown: string, from: string): string {
    return this.html(markdown, from).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1');
  }

  private img(target: string, from: string, alt: string, cls = ''): string {
    const file = this.mediaFile(target);
    return file ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(relativeHref(from, file))}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '';
  }

  /* ------------------------------------------------------------------ parts */

  private infobox(page: Page, from: string, map: MapModel | undefined): string {
    const facts = pageFacts(page);
    const image = map ? undefined : pageImage(page);
    const picture = image ? this.img(image, from, page.title) : '';
    if (!facts.length && !picture) return '';
    const rows = facts.map((f) => `<dt>${esc(f.key)}</dt><dd>${this.inline(f.value, from)}</dd>`).join('');
    return `<aside class="infobox">${picture ? `<div class="infobox-image">${picture}</div>` : ''}${rows ? `<dl>${rows}</dl>` : ''}</aside>`;
  }

  private mapPart(map: MapModel, page: Page, from: string): string {
    const picture = this.img(map.image, from, page.title, 'map-image');
    if (!picture) return '';
    const shapes: string[] = [];
    const pins: string[] = [];
    const list: string[] = [];
    for (const r of map.regions) {
      const href = r.page ? this.pageHref(from, r.page) : undefined;
      if (r.page && !href) continue; // The page is not on the site, and its name may give it away.
      if (r.points.length < 3) continue;
      const name = r.label ?? r.page ?? '';
      const colour = cleanColor(r.color) ?? '#1f7a6d';
      const pts = r.points.map(([x, y]) => `${num(x * 100, 0, 100)},${num(y * 100, 0, 100)}`).join(' ');
      const shape = `<polygon points="${pts}" fill="${colour}" stroke="${colour}"><title>${esc(name)}</title></polygon>`;
      shapes.push(href ? `<a href="${esc(href)}">${shape}</a>` : shape);
      if (name) list.push(href ? `<li><a href="${esc(href)}">${esc(name)}</a></li>` : `<li>${esc(name)}</li>`);
    }
    for (const p of map.pins) {
      const href = p.page ? this.pageHref(from, p.page) : undefined;
      if (p.page && !href) continue;
      const target = p.page ? (this.source.index.resolve(p.page)?.title ?? p.page) : '';
      const name = p.label ?? target;
      const pos = `left:${num(p.x * 100, 0, 100)}%;top:${num(p.y * 100, 0, 100)}%`;
      const inner = `<span class="pin-dot"></span><span class="pin-label">${esc(name)}</span>`;
      pins.push(href ? `<a class="pin" style="${pos}" href="${esc(href)}">${inner}</a>` : `<span class="pin" style="${pos}">${inner}</span>`);
      if (name) list.push(href ? `<li><a href="${esc(href)}">${esc(name)}</a></li>` : `<li>${esc(name)}</li>`);
    }
    const svg = shapes.length ? `<svg class="map-regions" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${shapes.join('')}</svg>` : '';
    const places = list.length ? `<ul class="map-list">${list.join('')}</ul>` : '';
    return `<figure class="map"><div class="map-frame">${picture}${svg}${pins.join('')}</div>${places}</figure>`;
  }

  private boardPart(page: Page, from: string): string {
    const board = boardOf(page);
    if (!board?.items.length) return '';
    const height = boardHeight(board.items);
    const top = (y: number) => num((y / height) * 100, 0, 100);
    const items: string[] = [];
    for (const item of board.items) {
      let style = `left:${num(item.x * 100, 0, 100)}%;top:${top(item.y)}%;width:${num(item.w * 100, 1, 100)}%`;
      let inner = '';
      let cls = `b-item b-${item.kind}`;
      const caption = item.caption ? `<span class="b-caption">${esc(item.caption)}</span>` : '';
      if (item.kind === 'image' && item.image) {
        const pic = this.img(item.image, from, item.caption ?? '');
        if (!pic) continue;
        if (item.h) {
          style += `;height:${num((item.h / height) * 100, 1, 100)}%`;
          cls += ' cropped';
        }
        inner = pic + caption;
      } else if (item.kind === 'color') {
        const colour = cleanColor(item.color);
        if (!colour) continue;
        style += `;height:${num(((item.h ?? item.w) / height) * 100, 1, 100)}%;background:${colour};color:${inkOn(colour)}`;
        inner = `<span class="b-code">${colour}</span>${caption}`;
      } else if (item.kind === 'quote' && item.quote) {
        inner = `<blockquote>${esc(item.quote)}${item.source ? `<cite>${esc(item.source)}</cite>` : ''}</blockquote>`;
      } else if (item.kind === 'note' && item.note) {
        const tint = cleanColor(item.tint) ?? '#f3e3a1';
        style += `;background:${tint};color:${inkOn(tint)}`;
        inner = esc(item.note).replace(/\n/g, '<br>');
      } else if (item.kind === 'page' && item.page) {
        const href = this.pageHref(from, item.page);
        if (!href) continue;
        const target = this.source.index.resolve(item.page);
        inner = `<a href="${esc(href)}">${esc(target?.title ?? item.page)}</a>`;
      } else continue;
      items.push(`<div class="${cls}" style="${style}">${inner}</div>`);
    }
    return items.length ? `<div class="board" style="aspect-ratio:1 / ${num(height, 0.1, 100)}">${items.join('')}</div>` : '';
  }

  private playlistPart(page: Page, from: string): string {
    const tracks = parsePlaylist(page.body)
      .map((tr) => {
        const file = this.mediaFile(tr.target);
        return file ? `<li><span class="track-title">${esc(tr.title)}</span><audio controls preload="none" src="${esc(relativeHref(from, file))}"></audio></li>` : '';
      })
      .filter(Boolean);
    return tracks.length ? `<ol class="tracks">${tracks.join('')}</ol>` : '';
  }

  private calendarPart(page: Page): string {
    const cal = calendarOf(page);
    if (!cal) return '';
    const summary = this.t('calendar.summary', cal.months.length, daysInYear(cal)) + (cal.week.length ? ` · ${this.t('calendar.week', cal.week.length)}` : '');
    const months = cal.months.map((m) => `<tr><th scope="row">${esc(m.name)}</th><td>${esc(this.t('calendar.days', m.days))}</td></tr>`).join('');
    const week = cal.week.length ? `<p class="cal-week">${cal.week.map(esc).join(' · ')}</p>` : '';
    const eras = cal.eras
      .map((e, i) => {
        const next = cal.eras[i + 1];
        const years = this.t('calendar.eraFrom', e.start) + (next ? ' ' + this.t('calendar.eraTo', next.start - 1, next.start - e.start) : '');
        return `<li><strong>${esc(e.name)}</strong>${e.short ? ` <span class="cal-short">${esc(e.short)}</span>` : ''} <span class="cal-era-years">${esc(years)}</span></li>`;
      })
      .join('');
    return `<section class="calendar"><p class="cal-summary">${esc(summary)}</p>${week}${eras ? `<ol class="cal-eras">${eras}</ol>` : ''}<table class="cal-months"><tbody>${months}</tbody></table></section>`;
  }

  /** Relations, pages that point here and mentions, as the panel shows them, with pages that are on the site. */
  private related(page: Page, from: string): string {
    const model = this.source.index.panel(page.path);
    const out: string[] = [];
    for (const section of model.sections) {
      const groups: string[] = [];
      for (const g of section.groups) {
        const links = g.items
          .map((item) => {
            const href = item.exists && item.path ? this.pageHref(from, item.path) : undefined;
            if (!href) return '';
            const words = item.alias ?? item.title;
            return `<a href="${esc(href)}">${esc(words)}</a>`;
          })
          .filter(Boolean);
        if (!links.length) continue;
        if (section.id === 'relations' || section.id === 'inverse') {
          const label = section.id === 'inverse' ? (g.inverseLabel ?? `← ${g.type}`) : g.type;
          groups.push(`<dt>${esc(label)}</dt><dd>${links.join(', ')}</dd>`);
        } else {
          groups.push(...links.map((l) => `<li>${l}</li>`));
        }
      }
      if (!groups.length) continue;
      const title = esc(this.t(`panel.section.${section.id}` as Key));
      const list = section.id === 'relations' || section.id === 'inverse' ? `<dl>${groups.join('')}</dl>` : `<ul>${groups.join('')}</ul>`;
      out.push(`<section><h2>${title}</h2>${list}</section>`);
    }
    return out.length ? `<aside class="related">${out.join('')}</aside>` : '';
  }

  /* ------------------------------------------------------------------ files */

  private document(file: string, title: string, main: string, bodyClass = ''): string {
    const home = relativeHref(file, 'index.html');
    const css = relativeHref(file, 'site.css');
    const js = relativeHref(file, 'site.js');
    const site = esc(this.options.title);
    const head = title === this.options.title ? site : `${esc(title)} · ${site}`;
    return `<!doctype html>
<html lang="${esc(this.options.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Exomyth">
<meta name="referrer" content="no-referrer">
<title>${head}</title>
<link rel="stylesheet" href="${css}">
<script src="${js}" defer></script>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<header class="site-bar"><a class="site-name" href="${home}">${site}</a><a class="site-all" href="${home}#all">${esc(this.t('site.allPages'))}</a></header>
${main}
<footer class="site-foot">${esc(this.t('site.madeWith'))}</footer>
</body>
</html>
`;
  }

  private write(path: string, text: string): void {
    this.files.set(path, this.enc.encode(text));
  }

  page(page: Page): void {
    const from = pageFile(page.path);
    const map = mapOf(page);
    const folder = page.path.includes('/') ? page.path.slice(0, page.path.lastIndexOf('/')) : '';
    const tag = tagOf(this.options.hiddenTag);
    const tags = page.tags.filter((x) => tagOf(x) !== tag);
    const parts: string[] = [];
    if (folder) parts.push(`<p class="crumbs">${esc(folder.split('/').join(' / '))}</p>`);
    parts.push(`<h1>${esc(page.title)}</h1>`);
    if (page.aliases.length) parts.push(`<p class="aka">${esc(this.t('page.aliases', page.aliases.join(', ')))}</p>`);
    if (tags.length) parts.push(`<p class="tags">${tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</p>`);
    const playlist = isPlaylist(page);
    if (playlist) parts.push(this.playlistPart(page, from));
    if (isBoard(page)) parts.push(this.boardPart(page, from));
    parts.push(this.calendarPart(page));
    if (map) parts.push(this.mapPart(map, page, from));
    if (isBook(page)) parts.push(`<p class="book-read"><a href="${esc(relativeHref(from, bookFile(page.path)))}">${esc(this.t('site.readBook'))}</a></p>`);
    parts.push(this.infobox(page, from, map));
    const body = playlist ? withoutTracks(page.body) : page.body;
    parts.push(`<div class="prose">${this.html(withoutTitleHeading(body, page.title), from)}</div>`);
    const main = `<main class="site-main"><article class="reading">${parts.filter(Boolean).join('\n')}</article>${this.related(page, from)}</main>`;
    this.write(from, this.document(from, page.title, main));
    if (isBook(page)) this.book(page);
  }

  /** A book read straight through: its chapters with the text of every scene on the site. */
  private book(page: Page): void {
    const from = bookFile(page.path);
    const book = parseBook(page, this.source.index);
    const parts: string[] = [`<p class="crumbs"><a href="${esc(relativeHref(from, pageFile(page.path)))}">${esc(page.title)}</a></p>`, `<h1>${esc(book.title)}</h1>`];
    for (const ch of book.chapters) {
      const scenes = ch.scenes.map((s) => (s.path ? this.source.index.get(s.path) : undefined)).filter((p): p is Page => !!p && this.included.has(p.path));
      if (!scenes.length) continue;
      if (ch.title) parts.push(`<h2>${esc(ch.title)}</h2>`);
      for (const scene of scenes) {
        const href = relativeHref(from, pageFile(scene.path));
        parts.push(`<h3 class="scene-title"><a href="${esc(href)}">${esc(scene.title)}</a></h3>`, `<div class="prose">${this.html(sceneText(scene), from)}</div>`);
      }
    }
    const main = `<main class="site-main book"><article class="reading">${parts.join('\n')}</article></main>`;
    this.write(from, this.document(from, book.title, main));
  }

  /** The front page: the start page's text, then every page by folder, with a search field. */
  index(): void {
    const from = 'index.html';
    const parts: string[] = [];
    const start = this.options.start ? this.source.index.get(this.options.start) : undefined;
    if (start && this.included.has(start.path)) {
      const body = withoutTitleHeading(start.body, start.title);
      // A start page that opens with its own heading gives the front page its title.
      if (!/^\s*#[ \t]/.test(body)) parts.push(`<h1>${esc(this.options.title)}</h1>`);
      parts.push(`<div class="prose">${this.html(body, from)}</div>`);
    } else parts.push(`<h1>${esc(this.options.title)}</h1>`);
    const byFolder = new Map<string, Page[]>();
    for (const p of this.pages) {
      const f = p.path.includes('/') ? p.path.slice(0, p.path.lastIndexOf('/')) : '';
      byFolder.set(f, [...(byFolder.get(f) ?? []), p]);
    }
    const folders = [...byFolder.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
    const lists = folders.map((f) => {
      const items = byFolder
        .get(f)!
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((p) => {
          const find = [p.title, ...p.aliases].join(' ').toLocaleLowerCase();
          const aka = p.aliases.length ? ` <span class="aka">${esc(p.aliases.join(', '))}</span>` : '';
          return `<li data-find="${esc(find)}"><a href="${esc(relativeHref(from, pageFile(p.path)))}">${esc(p.title)}</a>${aka}</li>`;
        })
        .join('');
      return `<section><h3>${esc(f ? f.split('/').join(' / ') : this.t('graph.root'))}</h3><ul>${items}</ul></section>`;
    });
    parts.push(
      `<section class="all-pages" id="all"><h2>${esc(this.t('site.allPages'))} <span class="count">${this.pages.length}</span></h2>` +
        `<input type="search" id="site-search" placeholder="${esc(this.t('site.search'))}" aria-label="${esc(this.t('site.search'))}" hidden>` +
        `<p id="site-nomatch" hidden>${esc(this.t('site.noMatch'))}</p>` +
        `<div class="folders">${lists.join('')}</div></section>`,
    );
    const main = `<main class="site-main front"><article class="reading">${parts.join('\n')}</article></main>`;
    this.write(from, this.document(from, this.options.title, main, 'front'));
  }

  async copyMedia(): Promise<number> {
    for (const [path, out] of this.media) {
      try {
        const read = await this.source.readFile(path);
        this.files.set(out, read instanceof Uint8Array ? read : new Uint8Array(read));
      } catch {
        /* A file that cannot be read is left out; its page still opens. */
      }
    }
    return this.media.size;
  }
}

/** Builds the site of a world. */
export async function buildSite(source: SiteSource, options: SiteOptions): Promise<Site> {
  const pages = sitePages(source.index, options);
  const b = new Builder(source, options, pages);
  for (const p of pages) b.page(p);
  b.index();
  b.files.set('site.css', new TextEncoder().encode(SITE_CSS));
  b.files.set('site.js', new TextEncoder().encode(SITE_JS));
  const media = await b.copyMedia();
  return { files: b.files, pages: pages.length, media };
}

/** Files that are already compressed: stored as they are. */
const PACKED = /\.(png|jpe?g|gif|webp|avif|mp4|m4v|webm|mov|mp3|m4a|aac|ogg|oga|opus|flac)$/i;

/** The site as one .zip with a folder inside, ready to unpack and open, or to upload to a web host. */
export function siteToZip(site: Site, folder: string): Uint8Array {
  const root = zipFolderName(folder);
  const files: Zippable = {};
  for (const [path, data] of [...site.files].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    files[`${root}/${path}`] = [data, { level: PACKED.test(path) ? 0 : 6 }];
  }
  return zipSync(files);
}

/* ------------------------------------------------------------- site files */

/** The look of the site: the app's chart-room colours, light or dark as the reader's system is set. */
const SITE_CSS = `/* Made by Exomyth. No fonts or files from elsewhere. */
:root {
  --paper: #edf1f2; --surface: #f7f9f9; --panel: #e4eaec; --ink: #17262f; --ink-soft: #3c4e59; --ink-faint: #566873;
  --line: #cbd6db; --accent: #1f7a6d; --accent-soft: #d3e8e4; --pin: #a8670f;
  --font-ui: 'Avenir Next', 'Segoe UI Variable', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', sans-serif;
  --font-text: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Times New Roman', serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #0e1a21; --surface: #122029; --panel: #0b151b; --ink: #dce7ea; --ink-soft: #a9bbc3; --ink-faint: #7a8d97;
    --line: #223540; --accent: #5cc2b1; --accent-soft: #17362f; --pin: #e2a94b;
    color-scheme: dark;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--font-ui); line-height: 1.5; }
a { color: var(--accent); }
.site-bar { display: flex; align-items: center; gap: 1rem; justify-content: space-between; padding: 0.6rem 1rem; background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; }
.site-name { font-family: var(--font-text); font-size: 1.15rem; font-weight: 600; color: var(--ink); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.site-all { font-size: 0.9rem; white-space: nowrap; }
.site-main { max-width: 1120px; margin: 0 auto; padding: 1.5rem 1rem 3rem; display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 2rem; align-items: start; }
.site-main.front, .site-main.book { grid-template-columns: minmax(0, 1fr); max-width: 820px; }
.site-foot { text-align: center; color: var(--ink-faint); font-size: 0.8rem; padding: 1rem 1rem 2rem; }
.reading { min-width: 0; }
.reading h1 { font-family: var(--font-text); font-size: 2.1rem; line-height: 1.2; margin: 0 0 0.4rem; }
.crumbs { margin: 0 0 0.2rem; color: var(--ink-faint); font-size: 0.85rem; }
.aka { color: var(--ink-soft); font-style: italic; margin: 0 0 0.5rem; }
.tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0 0 0.8rem; }
.chip { font-size: 0.78rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--accent-soft); color: var(--ink-soft); }
.prose { font-family: var(--font-text); font-size: 1.08rem; line-height: 1.65; overflow-wrap: anywhere; }
.prose h1, .prose h2, .prose h3, .prose h4, .book h2, .book h3 { font-family: var(--font-text); line-height: 1.25; margin: 1.6em 0 0.5em; }
.front .prose > h1:first-child { font-size: 2.1rem; margin-top: 0; }
.prose img, .prose video { max-width: 100%; height: auto; border-radius: 6px; }
.prose pre { overflow-x: auto; background: var(--panel); padding: 0.8rem; border-radius: 6px; font-family: var(--font-mono); font-size: 0.9rem; }
.prose code { font-family: var(--font-mono); font-size: 0.9em; }
.prose blockquote { margin: 1em 0; padding: 0.2em 1em; border-left: 3px solid var(--accent); color: var(--ink-soft); }
.prose table { border-collapse: collapse; display: block; overflow-x: auto; }
.prose th, .prose td { border: 1px solid var(--line); padding: 0.3rem 0.6rem; }
.embed { display: block; margin: 1em 0; }
.embed-image { display: inline-block; max-width: 100%; }
.embed-caption, .embed-name { display: block; color: var(--ink-faint); font-family: var(--font-ui); font-size: 0.85rem; margin-top: 0.2rem; }
.embed audio { width: 100%; max-width: 480px; }
.embed.missing { color: var(--ink-faint); font-style: italic; }
.spoiler { background: var(--ink-soft); color: transparent; border-radius: 3px; cursor: pointer; padding: 0 0.15em; }
.spoiler.revealed { background: var(--accent-soft); color: inherit; }
.spoiler:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.infobox { float: right; width: min(300px, 45%); margin: 0 0 1rem 1.5rem; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 0.8rem; font-size: 0.9rem; }
.infobox-image img { width: 100%; height: auto; border-radius: 6px; display: block; margin-bottom: 0.6rem; }
.infobox dl { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 0.8rem; margin: 0; }
.infobox dt { color: var(--ink-faint); }
.infobox dd { margin: 0; overflow-wrap: anywhere; }
.related { position: sticky; top: 4rem; font-size: 0.92rem; }
.related section { margin-bottom: 1.2rem; }
.related h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-faint); margin: 0 0 0.4rem; }
.related dl { margin: 0; }
.related dt { color: var(--ink-soft); font-weight: 600; margin-top: 0.4rem; }
.related dd { margin: 0; }
.related ul { margin: 0; padding-left: 1.1rem; }
.map { margin: 0 0 1.2rem; }
.map-frame { position: relative; line-height: 0; }
.map-image { width: 100%; height: auto; display: block; border-radius: 8px; }
.map-regions { position: absolute; inset: 0; width: 100%; height: 100%; }
.map-regions polygon { fill-opacity: 0.22; stroke-width: 0.4; vector-effect: non-scaling-stroke; }
.map-regions a polygon:hover { fill-opacity: 0.38; }
.pin { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; text-decoration: none; line-height: 1.2; }
.pin-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--pin); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45); }
.pin-label { margin-top: 2px; font-size: 0.75rem; color: #fff; background: rgba(14, 26, 33, 0.78); padding: 0 0.35rem; border-radius: 3px; white-space: nowrap; }
.map-list { columns: 2 12rem; margin: 0.8rem 0 0; padding-left: 1.1rem; font-size: 0.92rem; }
.board { position: relative; width: 100%; margin: 0 0 1.2rem; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; container-type: inline-size; overflow: hidden; }
.b-item { position: absolute; font-size: clamp(9px, 1.7cqw, 16px); line-height: 1.35; }
.b-item img { width: 100%; height: auto; display: block; border-radius: 4px; }
.b-item.cropped img { height: 100%; object-fit: cover; }
.b-color { border-radius: 4px; display: flex; flex-direction: column; justify-content: flex-end; padding: 0.3em 0.4em; }
.b-code { font-family: var(--font-mono); }
.b-caption { display: block; font-size: 0.9em; color: var(--ink-faint); }
.b-color .b-caption { color: inherit; }
.b-quote blockquote { margin: 0; font-family: var(--font-text); font-style: italic; }
.b-quote cite { display: block; font-style: normal; color: var(--ink-faint); margin-top: 0.2em; }
.b-note { padding: 0.5em 0.6em; border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18); }
.b-page a { display: block; padding: 0.4em 0.6em; background: var(--paper); border: 1px solid var(--line); border-radius: 4px; text-decoration: none; }
.tracks { padding-left: 1.4rem; margin: 0 0 1.2rem; }
.tracks li { margin-bottom: 0.6rem; }
.track-title { display: block; }
.tracks audio { width: 100%; max-width: 480px; }
.calendar { margin: 0 0 1.2rem; }
.cal-summary { color: var(--ink-soft); margin: 0 0 0.4rem; }
.cal-week { color: var(--ink-soft); margin: 0 0 0.6rem; }
.cal-eras { padding-left: 1.2rem; }
.cal-short, .cal-era-years { color: var(--ink-faint); }
.cal-months { border-collapse: collapse; }
.cal-months th, .cal-months td { text-align: left; padding: 0.2rem 1rem 0.2rem 0; border-bottom: 1px solid var(--line); font-weight: normal; }
.book-read { margin: 0 0 1rem; }
.book-read a { display: inline-block; padding: 0.35rem 0.8rem; border: 1px solid var(--accent); border-radius: 6px; text-decoration: none; }
.scene-title a { color: inherit; text-decoration: none; }
.all-pages { margin-top: 2rem; }
.all-pages h2 { font-family: var(--font-text); }
.all-pages .count { color: var(--ink-faint); font-size: 0.9rem; font-family: var(--font-ui); font-weight: normal; }
#site-search { width: 100%; max-width: 360px; font: inherit; padding: 0.45rem 0.7rem; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); margin-bottom: 0.6rem; }
.folders { columns: 2 16rem; column-gap: 2rem; }
.folders section { break-inside: avoid; margin-bottom: 1rem; }
.folders h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-faint); margin: 0 0 0.3rem; }
.folders ul { list-style: none; margin: 0; padding: 0; }
.folders li { padding: 0.12rem 0; }
.folders .aka { font-size: 0.85rem; }
[hidden] { display: none !important; }
@media (max-width: 860px) {
  .site-main { grid-template-columns: minmax(0, 1fr); }
  .related { position: static; border-top: 1px solid var(--line); padding-top: 1rem; }
}
@media (max-width: 560px) {
  .reading h1 { font-size: 1.7rem; }
  .infobox { float: none; width: auto; margin: 0 0 1rem; }
  .pin-label { display: none; }
}
@media print {
  .site-bar, .site-foot, #site-search { display: none; }
  .spoiler { color: inherit; background: none; }
}
`;

/** Spoilers that open on a click, and the search over the list of pages. The site works without it too. */
const SITE_JS = `// Made by Exomyth. Spoilers open on a click; the field on the front page finds pages by name.
(function () {
  function toggle(el) { el.classList.toggle('revealed'); }
  document.addEventListener('click', function (e) {
    var s = e.target.closest && e.target.closest('.spoiler');
    if (s) toggle(s);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('spoiler')) {
      e.preventDefault();
      toggle(e.target);
    }
  });
  var field = document.getElementById('site-search');
  if (!field) return;
  field.hidden = false;
  var none = document.getElementById('site-nomatch');
  field.addEventListener('input', function () {
    var q = field.value.trim().toLocaleLowerCase();
    var any = false;
    document.querySelectorAll('.all-pages li').forEach(function (li) {
      var show = !q || li.getAttribute('data-find').indexOf(q) !== -1;
      li.hidden = !show;
      if (show) any = true;
    });
    document.querySelectorAll('.folders section').forEach(function (s) {
      s.hidden = !s.querySelector('li:not([hidden])');
    });
    if (none) none.hidden = any;
  });
})();
`;
