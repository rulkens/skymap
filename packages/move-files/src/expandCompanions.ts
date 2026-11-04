/**
 * expandCompanions: append the moves for each primary's companion files (the
 * mirrored test, a sibling stylesheet) so they travel with it.
 *
 * A rule maps a root (`src/` to `tests/`) and derives companions by replacing
 * the primary's extension with each suffix. The source and destination roots
 * are resolved separately, so a move across rules lands the companion in the
 * destination's tree. `fileExists` is injected to keep this pure; it also picks
 * which suffix is real (`.test.ts` vs `.test.tsx`). Originals come first, and a
 * companion already named in `moves` keeps its explicit `to`.
 */

import type { CompanionRule } from './@types/CompanionRule';
import type { MovePair } from './@types/MovePair';

function ruleFor(
  path: string,
  rules: ReadonlyArray<CompanionRule>,
  sameSuffixesAs?: CompanionRule,
): { rule: CompanionRule; ext: string } | null {
  let best: { rule: CompanionRule; ext: string } | null = null;
  for (const rule of rules) {
    if (!path.startsWith(rule.from)) continue;
    if (sameSuffixesAs && rule.suffixes.join() !== sameSuffixesAs.suffixes.join()) continue;
    const ext = rule.sources.find((s) => path.endsWith(s));
    if (ext === undefined) continue;
    if (best === null || rule.from.length > best.rule.from.length) best = { rule, ext };
  }
  return best;
}

export function expandCompanions(
  moves: ReadonlyArray<MovePair>,
  rules: ReadonlyArray<CompanionRule>,
  fileExists: (path: string) => boolean,
): MovePair[] {
  const result: MovePair[] = [...moves];
  const taken = new Set(moves.map((m) => m.from));
  for (const { from, to } of moves) {
    for (const rule of rules) {
      const src = ruleFor(from, [rule]);
      const dst = src && ruleFor(to, rules, rule);
      if (!src || !dst) continue;
      const fromStem = rule.to + from.slice(rule.from.length, from.length - src.ext.length);
      const toStem = dst.rule.to + to.slice(dst.rule.from.length, to.length - dst.ext.length);
      for (const suffix of rule.suffixes) {
        const companion = fromStem + suffix;
        if (taken.has(companion) || !fileExists(companion)) continue;
        taken.add(companion);
        result.push({ from: companion, to: toStem + suffix });
      }
    }
  }
  return result;
}
