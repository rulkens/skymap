const QUOTED = /"([^"]+)"/g;
// A code span is the record's own string, not a holder's words: the marks inside it are not quotation marks.
const hideCode = (text: string): string =>
  text.replace(/`[^`]*`/g, (code) => code.replace(/"/g, '\u0001'));

/**
 * Sets a holder's own words apart as block quotes, by three rules:
 * 1. A block quote of the licence record stays one.
 * 2. A quotation becomes one where it stands as a sentence of its own: the
 *    record opens the text or a sentence with it, or leads into it with a
 *    colon, and the sentence ends with it (nothing follows, or a stop, a
 *    semicolon, a bracketed remark or a new sentence). Followed by a colon,
 *    a comma or more words, it stays in the line.
 * 3. After "Ours:", the record's lead-in for a string skymap itself prints,
 *    every quotation is set apart, whatever follows it.
 * Length decides nothing. No word changes: only the marks, a stop left
 * hanging after them, the line breaks and the capital of what follows.
 */
export function liftQuotes(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .flatMap((block) => {
      if (block.startsWith('>')) return [block];
      const text = block.replace(/\s+/g, ' ').trim();
      const parts: string[] = [];
      let last = 0;
      for (const match of hideCode(text).matchAll(QUOTED)) {
        const before = text.slice(0, match.index).trimEnd();
        const end = match.index + match[0].length;
        const after = text.slice(end);
        const opens = before === '' || /[:.]$/.test(before);
        const closes =
          /^\s*($|[.;](\s|$)|\()/.test(after) ||
          (/[.!?]$/.test(match[1]!) && /^\s+[A-Z]/.test(after));
        if (!/\bOurs:/.test(before) && !(opens && closes)) continue;
        parts.push(text.slice(last, match.index), `> ${text.slice(match.index + 1, end - 1)}`);
        last = end + (/^[.;,]/.test(after) ? 1 : 0);
      }
      parts.push(text.slice(last));
      return parts
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part, i) =>
          i > 0 && !part.startsWith('>') ? part.replace(/^[a-z]/, (c) => c.toUpperCase()) : part,
        );
    })
    .join('\n\n');
}
