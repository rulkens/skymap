/** A quotation this long is a text to print, not a phrase in a sentence. */
const LONG = 100;

/**
 * Sets each long quotation of a Markdown paragraph apart as a block quote, so
 * an acknowledgement a rights holder asks for stands on the page as theirs.
 * Only the quotation marks, a stop left hanging after them and the line breaks
 * change; no word is touched.
 */
export function liftQuotes(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map((block) =>
      block.startsWith('>')
        ? block
        : block.replace(/\s*"([^"]+)"(?:[.,;](?=\s|$))?\s*/g, (whole: string, quoted: string) =>
            quoted.length < LONG ? whole : `\n\n> ${quoted.replace(/\s+/g, ' ')}\n\n`,
          ),
    )
    .join('\n\n')
    .trim();
}
