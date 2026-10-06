import type { StarCutFrame } from '../../@types/StarCutFrame';

/**
 * Whether two frames ask the GPU for the same cut — every input that can move
 * a node's LOD target. `nowMs` and the shader scalars cannot.
 */
export function sameStarCut(a: StarCutFrame | null, b: StarCutFrame | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.originMpc.every((x, i) => x === b.originMpc[i]) &&
    a.refineThreshold === b.refineThreshold &&
    a.worldSpread === b.worldSpread &&
    a.leafMarginRad === b.leafMarginRad &&
    a.planes.length === b.planes.length &&
    a.planes.every((x, i) => x === b.planes[i]) &&
    a.sources.length === b.sources.length &&
    a.sources.every((s, i) => s.source === b.sources[i]!.source)
  );
}
