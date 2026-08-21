/**
 * cursorRayWorld — camera-eye ray toward wherever the cursor sits on screen.
 *
 *   cursor CSS px + canvas CSS size + camera pose + FOV/aspect  →  ray in world Mpc
 *
 * Same per-pixel-to-NDC-to-world family `orbitControls.ts`'s pan-drag
 * `pxToWorld` and `horizonShellRenderer.ts`'s frustum-corner unprojection
 * already use, resolved here for an ARBITRARY pixel rather than a canvas
 * delta or a fixed frustum corner. CSS Y grows down, NDC Y grows up — the
 * same flip `orbitControls.ts`'s pan step 3 documents.
 */

import { imagePlaneBasis } from './imagePlaneBasis';
import type { Vec3 } from '../../@types/math/Vec3';

export function cursorRayWorld(
  cursorCss: Readonly<{ x: number; y: number }>,
  canvasCssSize: Readonly<{ width: number; height: number }>,
  camPosMpc: Readonly<Vec3>,
  forward: Readonly<Vec3>,
  roll: number,
  upRef: Readonly<Vec3>,
  fovYRad: number,
  aspect: number,
): { readonly origin: Vec3; readonly direction: Vec3 } {
  const ndcX = (2 * cursorCss.x) / canvasCssSize.width - 1;
  const ndcY = 1 - (2 * cursorCss.y) / canvasCssSize.height;

  const basis = imagePlaneBasis(forward, roll, upRef);
  const tanHalfFovY = Math.tan(fovYRad / 2);
  const sx = ndcX * tanHalfFovY * aspect;
  const sy = ndcY * tanHalfFovY;

  const dx = forward[0] + sx * basis.right[0] + sy * basis.up[0];
  const dy = forward[1] + sx * basis.right[1] + sy * basis.up[1];
  const dz = forward[2] + sx * basis.right[2] + sy * basis.up[2];
  const len = Math.hypot(dx, dy, dz) || 1;

  return {
    origin: [camPosMpc[0], camPosMpc[1], camPosMpc[2]],
    direction: [dx / len, dy / len, dz / len],
  };
}
