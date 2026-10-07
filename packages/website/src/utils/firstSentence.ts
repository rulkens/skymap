// Words that end in a full stop without ending a sentence, as the licence record writes them.
const ABBREVIATION = /(?:\bet al|\be\.g|\bi\.e|\bNo|\bvs|\b[A-Z])$/;

/**
 * The first sentence of a line of the licence record, cut and never reworded.
 * A full stop inside a quotation does not end it, so a quoted term is kept
 * whole and the cut never leaves a quotation open.
 */
export function firstSentence(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') quoted = !quoted;
    if (quoted || (char !== '.' && char !== '"')) continue;
    const ends = char === '.' ? !ABBREVIATION.test(text.slice(0, i)) : text[i - 1] === '.';
    if (ends && (i + 1 === text.length || text[i + 1] === ' ')) return text.slice(0, i + 1);
  }
  return text;
}
