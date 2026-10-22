/** Anchor id for a heading; shared by rendered headings and `[[Page#Heading]]` links. */
export function headingSlug(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
