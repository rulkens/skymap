/**
 * A concave outline as convex pieces: earcut triangles, each as three inward
 * half-planes, so the mesh clip only ever runs convex Sutherland–Hodgman.
 */
import earcut from 'earcut';

import type { HalfPlane2 } from '../@types/HalfPlane2';
import type { Vec2 } from '../../../src/@types/math/Vec2';

export function triangulateOutline(ringM: readonly Vec2[]): HalfPlane2[][] {
  const triangles = earcut(ringM.flat());
  const pieces: HalfPlane2[][] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    let a = ringM[triangles[t]!]!;
    const b = ringM[triangles[t + 1]!]!;
    let c = ringM[triangles[t + 2]!]!;
    // earcut's output winding is not part of its contract; inward normals need CCW.
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) [a, c] = [c, a];
    pieces.push([edgePlane(a, b), edgePlane(b, c), edgePlane(c, a)]);
  }
  return pieces;
}

/** The half-plane left of the directed edge `from → to` — inside, for a CCW triangle. */
function edgePlane(from: Vec2, to: Vec2): HalfPlane2 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const normal: Vec2 = [-dy / length, dx / length];
  return { normal, offset: normal[0] * from[0] + normal[1] * from[1] };
}
