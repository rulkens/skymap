/**
 * dustSliceEdges — the dust map's per-frame depth-slice partition, extracted
 * from `drawFrame`'s per-frame block.
 *
 * Full derivation lives in `io.wesl`'s `dustSlices` doc; short version: the
 * spacing between tNear and tFar is GEOMETRIC (equal ratios per slice), which
 * degenerates to linear across [tNear,tFar] from outside the galaxy and turns
 * logarithmic once the eye is inside it and the 0.02*R floor engages (it
 * keeps tNear off zero, since a zero tNear makes tFar/tNear diverge).
 */
import type { FieldDustSlices } from '../../../@types/engine/FieldDustSlices';

/**
 * @param eyeDistance  Distance from the eye to the dust's own origin (D).
 * @param reachR       The dust's own reach (R) — 3x its widest component's sigmaR.
 */
export function dustSliceEdges(eyeDistance: number, reachR: number): FieldDustSlices {
  const tNear = Math.max(eyeDistance - reachR, 0.02 * reachR);
  const tFar = eyeDistance + reachR;
  const ratio = tFar / tNear;
  return {
    t1: tNear * ratio ** 0.25,
    t2: tNear * ratio ** 0.5,
    t3: tNear * ratio ** 0.75,
  };
}
