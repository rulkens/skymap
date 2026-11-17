/**
 * expandCompanions: append the moves for each primary's companion files (the
 * mirrored test, a sibling stylesheet) so they travel with it.
 *
 * A rule maps a root (`src/` to `tests/`) and derives companions by replacing the
 * primary's extension with each suffix. Source and destination roots resolve
 * separately, so a move across rules lands the companion in the destination's tree.
 * `fileExists` also picks which suffix is real (`.test.ts` vs `.test.tsx`). Originals
 * come first, and a companion already named in `moves` keeps its explicit `to`.
 */

import type { CompanionRule } from './@types/CompanionRule';
import type { MovePair } from './@types/MovePair';

const extensionIn = (path: string, rule: CompanionRule) =>
  rule.sources.find((source) => path.endsWith(source));

const governs = (rule: CompanionRule, path: string) =>
  path.startsWith(rule.from) && extensionIn(path, rule) !== undefined;

// The companion's path for a suffix, without it: the mirror root plus the primary's stem.
const stemIn = (path: string, rule: CompanionRule) =>
  rule.to + path.slice(rule.from.length, path.length - extensionIn(path, rule)!.length);

export function expandCompanions(
  moves: ReadonlyArray<MovePair>,
  rules: ReadonlyArray<CompanionRule>,
  fileExists: (path: string) => boolean,
): MovePair[] {
  const result: MovePair[] = [...moves];
  const taken = new Set(moves.map((m) => m.from));
  for (const { from, to } of moves) {
    for (const rule of rules) {
      if (!governs(rule, from)) continue;
      const target = rules.find(
        (r) => r.suffixes.join() === rule.suffixes.join() && governs(r, to),
      );
      if (!target) continue;
      for (const suffix of rule.suffixes) {
        const companion = stemIn(from, rule) + suffix;
        if (taken.has(companion) || !fileExists(companion)) continue;
        taken.add(companion);
        result.push({ from: companion, to: stemIn(to, target) + suffix });
      }
    }
  }
  return result;
}
