const SENTENCE_END = /[.!?]["”)]?$/;

/**
 * As much of a text as fits `max` characters, ended where the writer ended a
 * sentence if one ends in time. Otherwise it stops at the last comma,
 * semicolon or colon, or failing that the last word, and says so with an
 * ellipsis; a quotation cut open is closed after the ellipsis, so the page
 * never shows one mark without the other.
 */
export function fitText(text: string, max: number): string {
  if (text.length <= max) return text;
  const words = text.split(' ');
  let whole = '';
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max) break;
    line = next;
    if (SENTENCE_END.test(word)) whole = line;
  }
  if (whole) return whole;
  const room = text.slice(0, max - 2);
  const clause = Math.max(room.lastIndexOf(', '), room.lastIndexOf('; '), room.lastIndexOf(': '));
  const cut = room
    .slice(0, clause > max / 2 ? clause : room.lastIndexOf(' '))
    .replace(/[\s,;:(]+$/, '');
  const open = (cut.match(/"/g)?.length ?? 0) % 2 === 1;
  return `${cut} …${open ? '"' : ''}`;
}
