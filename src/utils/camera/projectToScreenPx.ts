/**
 * projectToScreenPx — a camera-relative anchor through a rebased vp to
 * backing-store screen pixels, or `null` when it sits on/behind the camera
 * plane (no screen position).
 *
 * Column-major mat4·vec4 by hand — the same forward projection `labelLeaderLine`
 * does, but returning the 2D screen point rather than a lifted world endpoint.
 * Screen +Y points DOWN, matching the caption declutter's separation metric
 * (pure pixel distance, orientation-agnostic).
 *
 * Its one caller is `starPointsLayer`'s pick. The caption declutter now runs
 * through `label2DDirector`'s own `projectLabels` instead — a separate
 * hand-rolled copy of the same forward projection (avoids a per-label
 * allocation) — so the two must still agree on the arithmetic even though
 * neither calls the other.
 */

import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';

export function projectToScreenPx(
  anchor: Readonly<Vec3>,
  vp: Float32Array | Float64Array,
  viewportPx: Readonly<Vec2>,
): Vec2 | null {
  const [x, y, z] = anchor;
  const clipX = vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!;
  const clipY = vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!;
  const clipW = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
  if (clipW <= 0) return null;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return [(ndcX * 0.5 + 0.5) * viewportPx[0], (0.5 - ndcY * 0.5) * viewportPx[1]];
}
