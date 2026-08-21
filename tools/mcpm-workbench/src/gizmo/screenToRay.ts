import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { CameraBasis } from '../render/cameraBasis';
import type { Ray } from '../../@types/Ray';

/**
 * screenToRay — world-space pick ray through an NDC point, from the
 * *unrotated* CameraBasis (the gizmo picks against world-space handle
 * geometry, never voxel space). Mirrors fragment.wesl's `dir = normalize(
 * camForward + camRight·ndc.x + camUp·ndc.y)` (fragment.wesl:59), where
 * that shader's camRight/camUp arrive pre-scaled by tan(fovY/2)·aspect
 * (writeView in tracePass.ts) — this applies the same scale explicitly
 * since CameraBasis itself carries no fov/aspect.
 */
export function screenToRay(
  eyeMpc: Readonly<Vec3>,
  basis: CameraBasis,
  fovYRad: number,
  aspect: number,
  ndc: readonly [number, number],
): Ray {
  const tanHalf = Math.tan(fovYRad / 2);
  const rs = ndc[0] * tanHalf * aspect;
  const us = ndc[1] * tanHalf;

  const dx = basis.forward[0] + basis.right[0] * rs + basis.up[0] * us;
  const dy = basis.forward[1] + basis.right[1] * rs + basis.up[1] * us;
  const dz = basis.forward[2] + basis.right[2] * rs + basis.up[2] * us;
  const len = Math.hypot(dx, dy, dz) || 1;

  return {
    origin: [eyeMpc[0], eyeMpc[1], eyeMpc[2]],
    dir: [dx / len, dy / len, dz / len],
  };
}
