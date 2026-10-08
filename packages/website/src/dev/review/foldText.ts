const QUOTES: Record<string, string> = {
  '‘': "'",
  '’': "'",
  ʼ: "'",
  '“': '"',
  '”': '"',
  '„': '"',
};

/**
 * Text the way a mark is matched against the page: every run of whitespace (a
 * no-break space included, which `\s` covers) is one space, and typographic
 * quotes and apostrophes are straight. Folding never changes the length of a
 * non-space character, so `at[i]` is where folded character i sits in `raw`.
 */
export function foldText(raw: string): { text: string; at: number[] } {
  let text = '';
  const at: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (/\s/.test(c)) {
      if (!text.endsWith(' ')) {
        text += ' ';
        at.push(i);
      }
    } else {
      text += QUOTES[c] ?? c;
      at.push(i);
    }
  }
  return { text, at };
}
