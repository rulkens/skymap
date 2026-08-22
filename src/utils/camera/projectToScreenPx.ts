/**
 * projectToScreenPx — a camera-relative anchor through a rebased vp to
 * backing-store screen pixels, or `null` when it sits on/behind the camera
 * plane (no screen position). Screen +Y points DOWN, matching the caption
 * declutter's separation metric (pure pixel distance, orientation-agnostic).
 *
 * Its one caller is `starPointsLayer`'s pick. The forward-projection
 * arithmetic itself lives in `forwardProjectPoint`, shared with
 * `label2DDirector` and `labelLeaderLine` — this wrapper just adapts that
 * primitive's mutable-out shape to the `Vec2 | null` callers here expect.
 */

import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import type { ForwardProjectedPoint } from '../../@types/camera/ForwardProjectedPoint';
import { forwardProjectPoint } from './forwardProjectPoint';

// Reused across calls — this function has no per-label loop of its own, but
// the primitive is alloc-free by contract, so a call-site scratch keeps it
// that way here too rather than allocating a fresh out object every pick.
const scratch: ForwardProjectedPoint = {
  clipX: 0,
  clipY: 0,
  clipZ: 0,
  clipW: 0,
  screenX: 0,
  screenY: 0,
  onScreen: false,
};

export function projectToScreenPx(
  anchor: Readonly<Vec3>,
  vp: Float32Array | Float64Array,
  viewportPx: Readonly<Vec2>,
): Vec2 | null {
  const [x, y, z] = anchor;
  forwardProjectPoint(vp, x, y, z, viewportPx, scratch);
  if (scratch.clipW <= 0) return null;
  return [scratch.screenX, scratch.screenY];
}
