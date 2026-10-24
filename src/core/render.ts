import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import type { VaultIndex } from './index';
import { parseLinkText } from './parse';
import { isExternal, mediaKind, parseEmbedOptions } from './media';
import { cleanText } from './critic';

import { headingSlug } from './slug';
export { headingSlug };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface WikiToken extends Tokens.Generic {
  type: 'wikilink';
  raw: string;
  target: string;
  heading?: string;
  label: string;
}

interface EmbedToken extends Tokens.Generic {
  type: 'embed';
  raw: string;
  inner: string;
}

/**
 * A placeholder for an image, video or audio file of the world. The interface fills it in after
 * rendering (see `hydrateEmbeds`), reading the file from the world's storage; nothing is loaded
 * from the network.
 */
function embedPlaceholder(target: string, alt: string, width?: number, height?: number): string {
  const kind = mediaKind(target) ?? 'image';
  const size = (width ? ` data-width="${width}"` : '') + (height ? ` data-height="${height}"` : '');
  return `<span class="embed embed-${kind}" data-embed="${escapeHtml(target)}" data-kind="${kind}" data-alt="${escapeHtml(alt)}"${size}></span>`;
}

interface SpoilerToken extends Tokens.Generic {
  type: 'spoiler';
  raw: string;
  text: string;
}

/** A comment or suggested change written with CriticMarkup (see `core/critic.ts`). */
interface CriticToken extends Tokens.Generic {
  type: 'critic';
  raw: string;
  kind: 'comment' | 'insert' | 'delete' | 'replace';
  comment: string;
  /** The marked passage, the added or removed words, or the old words of a replacement. */
  tokens: Tokens.Generic[];
  /** The new words of a replacement. */
  afterTokens: Tokens.Generic[];
}

/** Any character except the start of an empty line, as in `core/critic.ts`. */
const CC = String.raw`(?:(?!\n[ \t]*\n)[\s\S])`;
const CRITIC_RE = new RegExp(
  '^(?:' +
    [
      String.raw`\{==(${CC}+?)==\}(?:\{>>(${CC}*?)<<\})?`,
      String.raw`\{>>(${CC}*?)<<\}`,
      String.raw`\{\+\+(${CC}+?)\+\+\}`,
      String.raw`\{--(${CC}+?)--\}`,
      String.raw`\{~~(${CC}*?)~>(${CC}*?)~~\}`,
    ].join('|') +
    ')',
);

export interface RenderOptions {
  /** Show comments and suggested changes (true), or the text without them (false). */
  comments?: boolean;
}

/**
 * Renders Markdown to sanitised HTML. Wiki links become `<a class="wikilink" data-target>`
 * elements (`broken` when the page does not exist) so the UI can handle navigation itself.
 */
export function renderMarkdown(markdown: string, index: VaultIndex, options: RenderOptions = {}): string {
  if (options.comments === false) markdown = cleanText(markdown);
  // Comments are numbered in reading order, as in the editing panel.
  let commentNo = 0;
  let changeNo = 0;
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading(token) {
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${headingSlug(token.text)}">${inner}</h${token.depth}>\n`;
      },
      // Standard Markdown images: files of the world are embedded; web images become plain links,
      // so opening a page never contacts another server.
      image(token) {
        let href = token.href ?? '';
        try {
          href = decodeURI(href);
        } catch {
          /* Keep the address as written. */
        }
        if (!href) return escapeHtml(token.text);
        if (isExternal(href)) {
          return `<a href="${escapeHtml(token.href)}" class="external-media">${escapeHtml(token.text || token.href)}</a>`;
        }
        return embedPlaceholder(href.replace(/^\.\//, ''), token.text);
      },
    },
    extensions: [
      {
        name: 'embed',
        level: 'inline',
        start: (src: string) => src.indexOf('![['),
        tokenizer(src: string): EmbedToken | undefined {
          const m = /^!\[\[([^\[\]\n]+?)\]\]/.exec(src);
          return m ? { type: 'embed', raw: m[0], inner: m[1] ?? '' } : undefined;
        },
        renderer(token) {
          const inner = (token as EmbedToken).inner;
          const pipe = inner.indexOf('|');
          const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
          const opts = parseEmbedOptions(pipe === -1 ? undefined : inner.slice(pipe + 1));
          if (mediaKind(target)) return embedPlaceholder(target, opts.caption ?? '', opts.width, opts.height);
          // ![[Page]] of a page: shown as a link to it.
          const link = parseLinkText(inner);
          const page = index.resolve(link.target);
          const cls = page ? 'wikilink' : 'wikilink broken';
          const path = page ? ` data-path="${escapeHtml(page.path)}"` : '';
          return `<a class="${cls}" href="#" data-target="${escapeHtml(link.target)}"${path}>${escapeHtml(link.alias ?? link.target)}</a>`;
        },
      },
      {
        name: 'wikilink',
        level: 'inline',
        start: (src: string) => src.indexOf('[['),
        tokenizer(src: string): WikiToken | undefined {
          const m = /^\[\[([^\[\]\n]+?)\]\]/.exec(src);
          if (!m) return undefined;
          const link = parseLinkText(m[1] ?? '');
          if (!link.target) return undefined;
          const token: WikiToken = {
            type: 'wikilink',
            raw: m[0],
            target: link.target,
            label: link.alias ?? link.target + (link.heading ? ` › ${link.heading}` : ''),
          };
          if (link.heading) token.heading = link.heading;
          return token;
        },
        renderer(token) {
          const t = token as WikiToken;
          const page = index.resolve(t.target);
          const cls = page ? 'wikilink' : 'wikilink broken';
          const path = page ? ` data-path="${escapeHtml(page.path)}"` : '';
          const heading = t.heading ? ` data-heading="${escapeHtml(t.heading)}"` : '';
          return `<a class="${cls}" href="#" data-target="${escapeHtml(t.target)}"${path}${heading}>${escapeHtml(t.label)}</a>`;
        },
      },
      {
        name: 'spoiler',
        level: 'inline',
        start: (src: string) => src.indexOf('||'),
        tokenizer(src: string): SpoilerToken | undefined {
          const m = /^\|\|([^|\n]+?)\|\|/.exec(src);
          return m ? { type: 'spoiler', raw: m[0], text: m[1] ?? '' } : undefined;
        },
        renderer(token) {
          return `<span class="spoiler" tabindex="0">${escapeHtml((token as SpoilerToken).text)}</span>`;
        },
      },
      {
        name: 'critic',
        level: 'inline',
        start: (src: string) => {
          const i = src.search(/\{(==|>>|\+\+|--|~~)/);
          return i === -1 ? undefined : i;
        },
        tokenizer(src: string): CriticToken | undefined {
          const m = CRITIC_RE.exec(src);
          if (!m) return undefined;
          const inline = (s: string) => this.lexer.inlineTokens(s) as Tokens.Generic[];
          const base = { type: 'critic' as const, raw: m[0], comment: '', tokens: [] as Tokens.Generic[], afterTokens: [] as Tokens.Generic[] };
          if (m[1] !== undefined) return { ...base, kind: 'comment', tokens: inline(m[1]), comment: (m[2] ?? '').trim() };
          if (m[3] !== undefined) return { ...base, kind: 'comment', comment: m[3].trim() };
          if (m[4] !== undefined) return { ...base, kind: 'insert', tokens: inline(m[4]) };
          if (m[5] !== undefined) return { ...base, kind: 'delete', tokens: inline(m[5]) };
          return { ...base, kind: 'replace', tokens: inline(m[6] ?? ''), afterTokens: inline(m[7] ?? '') };
        },
        renderer(token) {
          const t = token as CriticToken;
          const inner = this.parser.parseInline(t.tokens);
          if (t.kind !== 'comment') {
            const k = ++changeNo;
            if (t.kind === 'insert') return `<ins class="critic-ins" data-change="${k}">${inner}</ins>`;
            if (t.kind === 'delete') return `<del class="critic-del" data-change="${k}">${inner}</del>`;
            return `<del class="critic-del" data-change="${k}">${inner}</del><ins class="critic-ins" data-change="${k}">${this.parser.parseInline(t.afterTokens)}</ins>`;
          }
          const n = ++commentNo;
          const passage = t.tokens.length ? `<mark class="critic-mark" data-critic="${n}">${inner}</mark>` : '';
          if (!t.comment) return passage;
          return `${passage}<span class="critic-note" data-critic="${n}" tabindex="0"><span class="critic-num">${n}</span><span class="critic-tip">${escapeHtml(t.comment)}</span></span>`;
        },
      },
    ],
  });

  const html = marked.parse(markdown, { async: false });
  return purifier().sanitize(html, {
    ADD_ATTR: ['data-critic', 'data-change', 'data-target', 'data-path', 'data-heading', 'data-embed', 'data-kind', 'data-alt', 'data-width', 'data-height'],
    // Only inert content: no scripts, forms, frames or media that would load from elsewhere.
    // Video and audio are added with ![[file]], which plays the world's own files.
    FORBID_TAGS: [
      'style', 'form', 'iframe', 'object', 'embed', 'script', 'video', 'audio', 'source', 'track',
      'button', 'textarea', 'select', 'option', 'dialog', 'meta', 'link', 'base',
    ],
    // Inline styles could cover the app with look-alike windows (a fake "enter your password" box).
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/**
 * Class names a page may carry: the ones this renderer adds and code-block languages. Anything
 * else is dropped, so text from a world someone shared cannot borrow the app's own styles
 * (for example to imitate one of its dialogs).
 */
const SAFE_CLASS = /^(wikilink|broken|spoiler|critic-(mark|note|num|tip|ins|del)|embed|embed-(image|video|audio)|external-media|language-[\w-]+)$/;

let instance: ReturnType<typeof DOMPurify> | undefined;

/** A sanitizer of our own (not the shared global one), with the rules above as hooks. */
function purifier(): ReturnType<typeof DOMPurify> {
  if (instance) return instance;
  const p = DOMPurify(window);
  p.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName !== 'class') return;
    const kept = data.attrValue.split(/\s+/).filter((c) => SAFE_CLASS.test(c));
    if (kept.length) data.attrValue = kept.join(' ');
    else data.keepAttr = false;
  });
  // Text inputs could imitate a sign-in form. Only the read-only checkboxes of task lists stay.
  p.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'input') return;
    const el = node as Element;
    if (el.getAttribute('type') === 'checkbox') el.setAttribute('disabled', '');
    else el.parentNode?.removeChild(el);
  });
  instance = p;
  return p;
}
