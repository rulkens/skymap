/**
 * famousWikipediaTitle — pick the best Wikipedia article title from a famous
 * galaxy's `names` array.
 *
 * Galaxy Wikipedia articles live under their NGC/IC designation, so we prefer
 * the first NGC/IC name in the list.  This handles two cases the old
 * `names[1] ?? names[0]` rule got wrong in opposite directions:
 *
 *   - Messier entries lead with a short id (`M51`) that resolves to a
 *     disambiguation page; the NGC slug (`NGC 5194`) is the real article.
 *     The old rule's `names[1]` happened to be the NGC slug here, so it worked.
 *   - Non-M/C entries lead with the NGC name and carry UGC/PGC/KPG aliases that
 *     have *no* Wikipedia article (e.g. `UGC 5516` 404s).  The old rule picked
 *     `names[1]` — an alias — and broke the link.
 *
 * Preferring the NGC/IC designation fixes both.  When no NGC/IC name is
 * present we keep the historical fallback (`names[1]` then `names[0]`).
 */
export function famousWikipediaTitle(names: readonly string[]): string {
  const ngcIc = names.find((n) => /^(NGC|IC)\s*\d/.test(n));
  return ngcIc ?? names[1] ?? names[0] ?? '';
}
