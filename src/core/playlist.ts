/**
 * Playlists: music for a world, a place or a scene. A playlist is an ordinary page with
 * `playlist: true` in its header. Its tracks are the list items that point to an audio file, in
 * order:
 *
 *   ---
 *   playlist: true
 *   ---
 *   # The Tavern
 *
 *   Played while the party rests.
 *
 *   - ![[Fiddle in the rain.mp3]]
 *   - ![[Last call.ogg|Last call, slow]]
 *
 * The audio files are normal files of the world. Everything else in the page (a description, other
 * lists, headings) stays text. Any page can be a playlist, so a scene can carry its own music.
 */
import type { Page } from './types';
import { mediaKind } from './media';
import { parseLinkText } from './parse';

export interface Track {
  /** The file as written in the link. */
  target: string;
  /** What the list shows: the text after `|`, or else the file name without its extension. */
  title: string;
  /** Line of the list item in the page body (0-based). */
  line: number;
}

/** Whether a page is a playlist (its header says `playlist: true`, or `yes`, or `плейлист`). */
export function isPlaylist(page: Pick<Page, 'frontmatter'>): boolean {
  const v = page.frontmatter.playlist;
  return v === true || (typeof v === 'string' && /^(true|yes|да|playlist|плейлист)$/i.test(v.trim()));
}

const ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(.*)$/;
const LINK = /!?\[\[([^\]\n]+)\]\]/g;
const FENCE = /^[ \t]*(```|~~~)/;

/** A track's name when the link gives none: the file name without folders and extension. */
function fileTitle(target: string): string {
  const name = target.slice(target.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

/** The tracks of a playlist page's body, in order. A list item with several files counts the first. */
export function parsePlaylist(body: string): Track[] {
  const tracks: Track[] = [];
  let fence = false;
  body.split(/\r?\n/).forEach((text, line) => {
    if (FENCE.test(text)) fence = !fence;
    if (fence) return;
    const item = ITEM.exec(text);
    if (!item) return;
    for (const m of item[1]!.matchAll(LINK)) {
      const link = parseLinkText(m[1] ?? '');
      if (mediaKind(link.target) !== 'audio') continue;
      // `|300` is an embed's width, not a name.
      const alias = link.alias && !/^\d{1,4}(\s*[x×]\s*\d{1,4})?$/.test(link.alias) ? link.alias : '';
      tracks.push({ target: link.target, title: alias || fileTitle(link.target), line });
      break;
    }
  });
  return tracks;
}

/** The body without the track lines, for the reading view (the player lists them instead). */
export function withoutTracks(body: string): string {
  const drop = new Set(parsePlaylist(body).map((t) => t.line));
  if (drop.size === 0) return body;
  return body
    .split(/\r?\n/)
    .filter((_, i) => !drop.has(i))
    .join('\n');
}
