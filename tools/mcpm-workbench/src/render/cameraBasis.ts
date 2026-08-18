import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';
import { cross3 } from '../../../../src/utils/math/cross3';
import { normalize3 } from '../../../../src/utils/math/normalize3';

/** An orthonormal right-handed frame: `forward` looks at the target, `up` is re-derived. */
export type CameraBasis = {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
};

/**
 * cameraBasis — the frame every mcpm view projects through, shared so the raymarch, the
 * agent splat and the galaxy overlay cannot drift apart on screen.
 *
 * Directions need no world→voxel transform of their own: GridBox voxels are cubic by
 * construction, so that map is a uniform scale and this normalises anyway.
 *
 * `box` is unused until F2.3 rotates these directions by R⁻¹ — GridBox has no
 * rotation field yet, so today this is identity.
 */
export function cameraBasis(
  eyeMpc: Readonly<Vec3>,
  targetMpc: Readonly<Vec3>,
  upMpc: Readonly<Vec3>,
  box: GridBox,
): CameraBasis {
  const forward = normalize3([
    targetMpc[0] - eyeMpc[0],
    targetMpc[1] - eyeMpc[1],
    targetMpc[2] - eyeMpc[2],
  ]);
  // A camera looking straight along 'up' collapses the cross product; fall back to an axis
  // forward is not aligned with so the basis stays finite.
  const sideways = cross3(forward, upMpc);
  const right = normalize3(
    Math.hypot(sideways[0], sideways[1], sideways[2]) > 1e-6
      ? sideways
      : cross3(forward, Math.abs(forward[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]),
  );
  return { right, up: cross3(right, forward), forward };
}
