import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

/** Boot check: a selection kind names at most one show entry, or the reveal saga's lookup
 * would depend on composition order. */
export function assertSelectsDisjoint(entries: readonly VisibilityEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!('key' in entry)) continue;
    for (const kind of entry.selects ?? []) {
      if (seen.has(kind)) {
        throw new Error(`assertSelectsDisjoint: kind "${kind}" is selected by two show entries`);
      }
      seen.add(kind);
    }
  }
}
