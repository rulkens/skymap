/**
 * The words of one bullet of `ATTRIBUTIONS.md` with its Markdown marks taken
 * out, for places that hold text only (a page's description, a table cell): a
 * link becomes its words, an address in angle brackets stays an address, and
 * code, emphasis and quote marks lose their signs.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\\\*/g, '*')
    .replace(/(^|\s)> /g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
