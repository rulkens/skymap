/**
 * findUnplaceableCompanions: companions that exist but have no rule for the
 * primary's destination, so moving the primary would orphan them.
 *
 * Asks `expandCompanions` twice instead of re-deriving rules: once with the
 * primary staying put (every companion it has) and once with the real move
 * (the ones that can follow). The difference is the unplaceable set, minus any
 * the caller named explicitly. Paths are repo-relative, as the rules are.
 */

import type { CompanionRule } from './@types/CompanionRule';
import type { MovePair } from './@types/MovePair';
import { expandCompanions } from './expandCompanions';

export function findUnplaceableCompanions(
  moves: readonly MovePair[],
  rules: readonly CompanionRule[],
  fileExists: (path: string) => boolean,
): string[] {
  const named = new Set(moves.map((m) => m.from));
  const unplaceable: string[] = [];
  for (const move of moves) {
    const all = expandCompanions([{ from: move.from, to: move.from }], rules, fileExists).slice(1);
    const placed = new Set(expandCompanions([move], rules, fileExists).map((m) => m.from));
    for (const { from } of all) {
      if (!placed.has(from) && !named.has(from) && !unplaceable.includes(from))
        unplaceable.push(from);
    }
  }
  return unplaceable;
}
