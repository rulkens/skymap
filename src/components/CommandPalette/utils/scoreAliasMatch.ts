/**
 * scoreAliasMatch — sibling to scoreFamousMatch.  Ranks one alias
 * entry (a PGC + its list of human-typable names) against a user
 * query.
 *
 * Why a separate scorer instead of reusing scoreFamousMatch?  The
 * shapes overlap (both have a `names` array) but the supporting
 * fields differ: famous entries carry a `description` and `id` we
 * also want to match against, while alias entries don't.  Reusing
 * scoreFamousMatch with stub `description: ''` and `id: ''` would
 * silently make every alias score lower than every famous entry on
 * tied substring matches — exactly the ordering the brief calls
 * for ("famous wins ties"), but achieved as a side effect rather
 * than an explicit rule.  Splitting the scorers makes the rule
 * legible at the call site.
 *
 * ### Score table
 *
 *   - Exact (case-insensitive) name match → 1000
 *   - Name starts with query              →  500 + length-bonus
 *   - Name contains query as substring    →  100 + length-bonus
 *   - No match                            →    0
 *
 * Exactly the same breakpoints as scoreFamousMatch's name-only path
 * — so ordering is consistent when both lists are interleaved.  The
 * palette's caller adds a small offset to famous scores when needed
 * to enforce the "famous wins ties" rule.
 */

export type ScorableAliasEntry = {
  /** All human-typable names for this entry (e.g. ["NGC 4565", "UGC 7772"]). */
  names: readonly string[];
};

export function scoreAliasMatch(entry: ScorableAliasEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 0;
  const lengthBonus = q.length;

  let best = 0;
  for (const name of entry.names) {
    const n = name.toLowerCase();
    if (n === q) return 1000 + lengthBonus;
    if (n.startsWith(q)) best = Math.max(best, 500 + lengthBonus);
    else if (n.includes(q)) best = Math.max(best, 100 + lengthBonus);
    // Also try a "spaceless" comparison so the user can type
    // `ngc4565` and still find `NGC 4565` — astronomers write the
    // names both ways and the palette shouldn't gate on that detail.
    else {
      const nNoSpace = n.replace(/\s+/g, '');
      if (nNoSpace === q) best = Math.max(best, 1000 + lengthBonus);
      else if (nNoSpace.startsWith(q)) best = Math.max(best, 500 + lengthBonus);
      else if (nNoSpace.includes(q)) best = Math.max(best, 100 + lengthBonus);
    }
  }
  return best;
}
