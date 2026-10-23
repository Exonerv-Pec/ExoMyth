/** Images, video and audio that can be embedded in pages with `![[file]]`. */

export type MediaKind = 'image' | 'video' | 'audio';

const TYPES: Record<string, [MediaKind, string]> = {
  png: ['image', 'image/png'],
  jpg: ['image', 'image/jpeg'],
  jpeg: ['image', 'image/jpeg'],
  gif: ['image', 'image/gif'],
  webp: ['image', 'image/webp'],
  avif: ['image', 'image/avif'],
  bmp: ['image', 'image/bmp'],
  svg: ['image', 'image/svg+xml'],
  mp4: ['video', 'video/mp4'],
  m4v: ['video', 'video/mp4'],
  webm: ['video', 'video/webm'],
  ogv: ['video', 'video/ogg'],
  mov: ['video', 'video/quicktime'],
  mp3: ['audio', 'audio/mpeg'],
  wav: ['audio', 'audio/wav'],
  ogg: ['audio', 'audio/ogg'],
  oga: ['audio', 'audio/ogg'],
  opus: ['audio', 'audio/ogg'],
  m4a: ['audio', 'audio/mp4'],
  aac: ['audio', 'audio/aac'],
  flac: ['audio', 'audio/flac'],
};

/** Folder (inside the world) where added media files are saved. */
export const ATTACHMENTS_DIR = 'attachments';

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function mediaKind(path: string): MediaKind | undefined {
  return TYPES[extensionOf(path)]?.[0];
}

export function mimeType(path: string): string {
  return TYPES[extensionOf(path)]?.[1] ?? 'application/octet-stream';
}

/** True for links that point outside the world (web addresses and the like). */
export function isExternal(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src);
}

/**
 * Reads an embed's display size from the part after `|`: `300` (width) or `300x200`.
 * Anything else is treated as a caption.
 */
export function parseEmbedOptions(extra: string | undefined): { width?: number; height?: number; caption?: string } {
  if (!extra) return {};
  const m = /^\s*(\d{1,4})(?:\s*[x×]\s*(\d{1,4}))?\s*$/.exec(extra);
  if (!m) return { caption: extra.trim() };
  const out: { width?: number; height?: number } = { width: Number(m[1]) };
  if (m[2]) out.height = Number(m[2]);
  return out;
}

/** Media types the "insert" file picker accepts. */
export const MEDIA_ACCEPT = 'image/*,video/*,audio/*,' + Object.keys(TYPES).map((e) => '.' + e).join(',');
