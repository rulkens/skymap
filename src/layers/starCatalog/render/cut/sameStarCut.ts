import type { StarCutInputs } from '../../@types/StarCutInputs';
import { sameStructure } from '../../../../utils/object/sameStructure';

/**
 * Whether two frames ask the GPU for the same cut: `cut` compared whole, so
 * `nowMs` and the shade scalars alone never count as a change.
 */
export function sameStarCut(a: StarCutInputs | null, b: StarCutInputs | null): boolean {
  if (a === null || b === null) return a === b;
  return sameStructure(a.cut, b.cut);
}
