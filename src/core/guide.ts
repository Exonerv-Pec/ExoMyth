/**
 * The guide: `docs/GUIDE.md` (and `docs/GUIDE.ru.md`) read as topics. The same files are the guide on
 * GitHub, so there is one text to keep up to date. Each `##` section is a topic; the comment under
 * its heading names it and says what "Try it" does:
 *
 *   ## Graph
 *   <!-- guide: graph | feature: graph | try: mode:graph -->
 *
 *   ![The graph of the demo world](../public/guide/en/graph.webp)
 *
 *   Text of the topic…
 *
 * The picture's file name is kept; the app shows it from its own `guide/<lang>/` folder.
 */

export type GuideTry =
  | { kind: 'mode'; mode: string }
  | { kind: 'open'; path: string; panel?: 'revision' }
  | { kind: 'action'; name: string };

export interface GuideTopic {
  id: string;
  title: string;
  /** The part of Settings this topic is about, if it can be switched off. */
  feature?: string;
  try?: GuideTry;
  image?: { file: string; alt: string };
  /** Markdown of the topic, without its heading, its comment and its picture. */
  body: string;
}

const META_RE = /^<!--\s*guide:\s*([\s\S]*?)-->\s*$/m;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/m;

/** `mode:graph`, `open:Maps/Silver Coast.md`, `open:Scenes/X.md+revision`, `lookup`… */
export function parseTry(value: string | undefined): GuideTry | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (v.startsWith('mode:')) return { kind: 'mode', mode: v.slice(5).trim() };
  if (v.startsWith('open:')) {
    const rest = v.slice(5).trim();
    const plus = rest.lastIndexOf('+');
    if (plus !== -1 && rest.slice(plus + 1) === 'revision') return { kind: 'open', path: rest.slice(0, plus).trim(), panel: 'revision' };
    return { kind: 'open', path: rest };
  }
  return { kind: 'action', name: v };
}

/** The topics of a guide file, in order. Sections without a guide comment are left out. */
export function parseGuide(markdown: string): GuideTopic[] {
  const text = markdown.replace(/\r\n?/g, '\n');
  const out: GuideTopic[] = [];
  const parts = text.split(/^## /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim();
    let rest = nl === -1 ? '' : part.slice(nl + 1);
    const meta = META_RE.exec(rest);
    if (!meta) continue;
    rest = rest.replace(META_RE, '');
    const fields = meta[1]!.split('|').map((s) => s.trim());
    const id = fields[0]!.trim();
    if (!id) continue;
    const topic: GuideTopic = { id, title, body: '' };
    for (const f of fields.slice(1)) {
      const colon = f.indexOf(':');
      if (colon === -1) continue;
      const key = f.slice(0, colon).trim();
      const value = f.slice(colon + 1).trim();
      if (key === 'feature' && value) topic.feature = value;
      else if (key === 'try') {
        const t = parseTry(value);
        if (t) topic.try = t;
      }
    }
    const img = IMAGE_RE.exec(rest);
    if (img) {
      topic.image = { alt: img[1]!.trim(), file: img[2]!.slice(img[2]!.lastIndexOf('/') + 1) };
      rest = rest.replace(IMAGE_RE, '');
    }
    topic.body = rest.trim();
    out.push(topic);
  }
  return out;
}

/** Whether a topic mentions every word of a search (in its title or its text). */
export function topicMatches(topic: GuideTopic, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${topic.title}\n${topic.body}`.toLocaleLowerCase().replace(/[*_`[\]#>|]/g, ' ');
  return words.every((w) => hay.includes(w));
}
