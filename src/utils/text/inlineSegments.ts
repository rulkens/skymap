/**
 * inlineSegments — split authored exhibit copy into tagged runs on the two
 * tags that copy may use: `<i>…</i>` and `<a href="…">…</a>`. Everything else
 * stays literal text, so a stray `<b>` reads as the characters it is rather
 * than silently vanishing. The caller renders real elements per run, never
 * `dangerouslySetInnerHTML` — the copy is authored in `exhibitRegistry.ts`,
 * but routing it through an HTML sink would make the next author's typo an
 * injection site.
 */

import type { InlineSegment } from '../../@types/exhibits/InlineSegment';

// One alternation, so the two tags cannot nest or interleave wrongly: whichever
// opens first wins the run. Non-greedy bodies, since two links in one sentence
// would otherwise match as a single span from the first `<a` to the last `</a>`.
const MARKUP = /<i>(.*?)<\/i>|<a href="([^"]*)">(.*?)<\/a>/g;

export function inlineSegments(text: string): readonly InlineSegment[] {
  const segments: InlineSegment[] = [];
  let cursor = 0;

  // `matchAll` rather than a stateful `exec` loop: MARKUP is a module-level
  // regex, and a `lastIndex` left behind by an early return would make the
  // NEXT call start mid-string.
  for (const match of text.matchAll(MARKUP)) {
    const [whole, emText, href, linkText] = match;
    if (match.index > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, match.index) });
    }
    segments.push(
      emText !== undefined
        ? { kind: 'em', text: emText }
        : { kind: 'link', text: linkText ?? '', href: href ?? '' },
    );
    cursor = match.index + whole.length;
  }

  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}
