/**
 * geodesicPath — camera-domain wrapper around `zoomPanGeodesic`: the only place
 * that converts `(target, distance)` to and from the geodesic's `(u, w)`, and
 * derives a duration from arc length. Spec §2.1 (units), §2.4 (the reverse
 * geodesic): docs/superpowers/specs/2026-10-27-geodesic-focus-moves-design.md
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { GeodesicPath } from '../../@types/camera/GeodesicPath';
import type { GeodesicTuning } from '../../@types/camera/GeodesicTuning';
import { zoomPanGeodesic } from './zoomPanGeodesic';
import { GEODESIC_RHO_MIN } from '../../data/camera/focusMoveDefaults';
import { distanceMpc } from '../math/distanceMpc';

export function geodesicPath(
  from: { readonly target: Vec3; readonly distance: number },
  to: { readonly target: Vec3; readonly distance: number },
  fovYRad: number,
  tuning: GeodesicTuning,
): GeodesicPath {
  const rho = Math.max(GEODESIC_RHO_MIN, tuning.rho);

  // w = 2·distance·tan(fovY/2): fovY, not fovX, no aspect factor (§2.1).
  const halfTanFovY = Math.tan(fovYRad / 2);
  const w0 = 2 * from.distance * halfTanFovY;
  const w1 = 2 * to.distance * halfTanFovY;
  const du = distanceMpc(from.target, to.target);

  const geodesic = zoomPanGeodesic(0, w0, du, w1, rho);
  // max outermost, so minMs wins when the sliders cross the bounds.
  const durationMs = Math.max(
    tuning.minMs,
    Math.min(tuning.maxMs, (geodesic.length / tuning.velocity) * 1000),
  );

  // The SAME curve measured from the far end. Near the destination the forward
  // `u` is a large number whose useful part is its last few bits, so
  // `lerp(from, to, u/du)` quantises the target to one ULP of `du`: on
  // Andromeda → Earth that is 0.84 Earth radii while the camera sits 9e-16 Mpc
  // out. Reading the offset from the nearer endpoint keeps it small.
  const reverse = du === 0 ? null : zoomPanGeodesic(0, w1, du, w0, rho);
  const dir: Vec3 =
    du === 0
      ? [0, 0, 0]
      : [
          (to.target[0] - from.target[0]) / du,
          (to.target[1] - from.target[1]) / du,
          (to.target[2] - from.target[2]) / du,
        ];

  return {
    durationMs,
    at: (arcFrac: number) => {
      const s = arcFrac * geodesic.length;
      const { u, w } = geodesic.at(s);
      const distance = w / (2 * halfTanFovY);

      // Degenerate (pure zoom): the target never moves off `from`.
      if (reverse === null) return { target: [...from.target] as Vec3, distance };

      if (2 * u <= du) {
        return {
          target: [
            from.target[0] + dir[0] * u,
            from.target[1] + dir[1] * u,
            from.target[2] + dir[2] * u,
          ],
          distance,
        };
      }
      const back = reverse.at(geodesic.length - s).u;
      return {
        target: [
          to.target[0] - dir[0] * back,
          to.target[1] - dir[1] * back,
          to.target[2] - dir[2] * back,
        ],
        distance,
      };
    },
  };
}
