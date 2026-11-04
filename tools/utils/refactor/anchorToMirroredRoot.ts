/**
 * anchorToMirroredRoot: split an absolute ts-morph Project path at one of the
 * rule roots (`src/`, `tools/`, ...) so planners can speak the repo-relative
 * language `expandCompanions` keys off. Invariant: `prefix + rel === absPath`.
 *
 * Roots come from the rules, longest first, so `packages/move-files/src/` isn't
 * anchored at its inner `/src/`. Each root matches its LAST occurrence, so a
 * checkout path above the repo that contains `/src/` stays in `prefix`. A path
 * under no root returns null: the convention doesn't cover it.
 */

import { companionRules } from './companionRules';

const ROOTS = companionRules
  .map((rule) => rule.from)
  .filter((root) => root !== '')
  .sort((a, b) => b.length - a.length);

export function anchorToMirroredRoot(absPath: string): { rel: string; prefix: string } | null {
  for (const root of ROOTS) {
    const idx = absPath.lastIndexOf(`/${root}`);
    if (idx !== -1) {
      return { rel: absPath.slice(idx + 1), prefix: absPath.slice(0, idx + 1) };
    }
  }
  return null;
}
