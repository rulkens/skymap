// A bare `--`, or `--name`, standing as a word of its own.
const FLAG = /(?<![\w-])--(?:[a-z][\w-]*)?(?![\w-])/g;

/**
 * A sentence cut at its command-line flags, so that a page can set each flag
 * as code. In the text face two hyphens sit 0.2 px apart and read as one
 * dash: a reader who types what is printed gets an error.
 */
export function flagParts(text: string): { text: string; flag: boolean }[] {
  const parts: { text: string; flag: boolean }[] = [];
  let from = 0;
  for (const match of text.matchAll(FLAG)) {
    if (match.index > from) parts.push({ text: text.slice(from, match.index), flag: false });
    parts.push({ text: match[0], flag: true });
    from = match.index + match[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), flag: false });
  return parts;
}
