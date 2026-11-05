const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  '#x27': "'",
  nbsp: ' ',
};

/**
 * The words a reader meets on a built page, as one line: no head, script or
 * style, and not the "Sources for this page" list, which prints every row it
 * cites in full on purpose. Tags go without leaving a space, since a fact row
 * can have one in the middle of a word (a flag set as code).
 */
export function pageWords(html: string): string {
  return html
    .replace(/<(head|script|style)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<details class="Sources-root\b[\s\S]*?<\/details>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
    .replace(/\s+/g, ' ')
    .trim();
}
