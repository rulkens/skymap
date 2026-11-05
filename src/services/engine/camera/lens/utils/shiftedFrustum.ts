/**
 * shiftedFrustum — the symmetric lens slid so its axis lands at `shiftNdc`.
 * The extents stay those of the symmetric lens, so navigation rates per pixel
 * do not change. Built off `symmetricFrustum` so a zero shift is that frustum
 * bit for bit (the settle golden trace holds it).
 */

import type { ViewFrustum } from '../../../../../@types/camera/ViewFrustum';
import type { Vec2 } from '../../../../../@types/math/Vec2';
import { symmetricFrustum } from '../../../../../utils/camera/frustum/symmetricFrustum';

export function shiftedFrustum(
  fovYRad: number,
  aspect: number,
  shiftNdc: Readonly<Vec2>,
): ViewFrustum {
  const lens = symmetricFrustum(fovYRad, aspect);
  const [cx, cy] = shiftNdc;
  return {
    tanLeft: lens.tanLeft * (1 + cx),
    tanRight: lens.tanRight * (1 - cx),
    tanDown: lens.tanDown * (1 + cy),
    tanUp: lens.tanUp * (1 - cy),
  };
}
