/**
 * Wikipedia title selection — the rule used across the project for
 * picking a galaxy's most-reliable Wikipedia article title.
 *
 * Matches the convention in src/components/InfoCard/FullCard.tsx: prefer
 * the second name (NGC/IC catalog id like "NGC 5194", "IC 342") over the
 * first name (short Messier/Caldwell id like "M51", "C3").  The short
 * ids almost always resolve to a Wikipedia disambiguation page — "M51"
 * lists motorways, rifles, and chess openings before mentioning the
 * galaxy — while the NGC/IC slug reliably hits the actual galaxy article.
 *
 * Other curator code uses this helper for: (a) the "open in Wikipedia"
 * link in the image picker, and (b) ordering candidate page titles when
 * looking up the article's images via MediaWiki.
 */

export function pickWikipediaTitle(names: ReadonlyArray<string>): string | undefined {
  return names[1] ?? names[0];
}

export function wikipediaArticleUrl(names: ReadonlyArray<string>): string | undefined {
  const t = pickWikipediaTitle(names);
  if (t === undefined) return undefined;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
}

/**
 * Names reordered so the preferred Wikipedia title is tried first.  Used
 * as the candidate list for fetchWikipediaArticleImages, which walks
 * candidates until one resolves to a real page with images.
 */
export function wikipediaCandidateOrder(names: ReadonlyArray<string>): string[] {
  if (names.length === 0) return [];
  const preferred = pickWikipediaTitle(names);
  // De-duplicate while keeping order: preferred first, then everything
  // else in original order.  filter(Boolean) drops the undefined case.
  const out: string[] = [];
  if (preferred) out.push(preferred);
  for (const n of names) {
    if (n !== preferred && !out.includes(n)) out.push(n);
  }
  return out;
}
