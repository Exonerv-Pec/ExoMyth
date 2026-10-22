import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import type { VaultIndex } from './index';
import { parseLinkText } from './parse';

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

interface SpoilerToken extends Tokens.Generic {
  type: 'spoiler';
  raw: string;
  text: string;
}

/**
 * Renders Markdown to sanitised HTML. Wiki links become `<a class="wikilink" data-target>`
 * elements (`broken` when the page does not exist) so the UI can handle navigation itself.
 */
export function renderMarkdown(markdown: string, index: VaultIndex): string {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading(token) {
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${headingSlug(token.text)}">${inner}</h${token.depth}>\n`;
      },
    },
    extensions: [
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
    ],
  });

  const html = marked.parse(markdown, { async: false });
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-target', 'data-path', 'data-heading'],
    // Only inert content: no scripts, forms, frames or external embeds.
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'script'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
