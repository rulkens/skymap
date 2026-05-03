/**
 * scoreFamousMatch — a small heuristic that ranks one famous-galaxy
 * entry against a user-typed query.  Higher numbers mean better matches.
 *
 * We deliberately avoid pulling in a fuzzy-search library (fuse.js etc.)
 * because (a) a 150-entry catalog doesn't benefit from clever indexing,
 * and (b) the rules a user expects are simple: name match wins, common
 * name match is fine, description match is fallback.  Rolling our own
 * keeps the dependency surface flat and the behaviour easy to reason
 * about.
 *
 * Scoring rules (in priority order):
 *   - Exact (case-insensitive) match against any name → 1000
 *   - Name starts with query → 500 + (length-bonus)
 *   - Name contains query as substring → 100 + (length-bonus)
 *   - Description contains query → 10 + (length-bonus)
 *   - No match → 0
 *
 * `length-bonus` is `query.length`, used only as a tiebreaker so longer
 * queries that match exactly still beat shorter queries that prefix.
 */

export type ScorableEntry = {
  id: string;
  names: readonly string[];
  description: string;
};

export function scoreFamousMatch(entry: ScorableEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 0;
  const lengthBonus = q.length;

  let best = 0;
  for (const name of entry.names) {
    const n = name.toLowerCase();
    if (n === q) return 1000 + lengthBonus;
    if (n.startsWith(q)) best = Math.max(best, 500 + lengthBonus);
    else if (n.includes(q)) best = Math.max(best, 100 + lengthBonus);
  }
  if (entry.description.toLowerCase().includes(q)) {
    best = Math.max(best, 10 + lengthBonus);
  }
  // Also try the id as a last-resort match (e.g. typing "ngc-5128").
  if (entry.id.toLowerCase().includes(q)) {
    best = Math.max(best, 50 + lengthBonus);
  }
  return best;
}
