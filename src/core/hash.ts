/** 32-bit FNV-1a of a string, as 8 hex digits, prefixed with the length (a public-domain hash). */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length.toString(36)}-${(h >>> 0).toString(16).padStart(8, '0')}`;
}
