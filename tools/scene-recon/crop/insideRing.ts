/**
 * Even-odd point-in-ring. `texturedMesh.wesl`'s `insideMask` repeats this exact
 * rule, half-open test included, so the preview mask and the CLI's cut agree.
 */
import type { Vec2 } from '../../../src/@types/math/Vec2';

export function insideRing(p: Vec2, ringM: readonly Vec2[]): boolean {
  if (ringM.length < 3) return true;
  const [px, py] = p;
  let inside = false;
  for (let i = 0, j = ringM.length - 1; i < ringM.length; j = i++) {
    const [xi, yi] = ringM[i]!;
    const [xj, yj] = ringM[j]!;
    // Half-open in y: a ray through a corner crosses exactly one of its two edges.
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
