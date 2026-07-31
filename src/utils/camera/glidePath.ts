/**
 * glidePath — camera-domain wrapper around `zoomPanGeodesic`: the only place
 * that converts `(target, distance)` to and from the geodesic's `(u, w)`
 * metric, and derives a duration from arc length. Spec §2.1 (units), §5.1/§5.3
 * (duration): docs/superpowers/specs/2026-07-31-perceptually-uniform-focus-moves.md
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { GlidePath } from '../../@types/camera/GlidePath';
import type { GlideTuning } from '../../@types/camera/GlideTuning';
import { zoomPanGeodesic } from './zoomPanGeodesic';
import { DEFAULT_GLIDE_TUNING, GLIDE_RHO_MIN } from './glideCalibration';
import { distanceMpc } from '../math/distanceMpc';

export function glidePath(
  from: { readonly target: Vec3; readonly distance: number },
  to: { readonly target: Vec3; readonly distance: number },
  fovYRad: number,
  tuning: Partial<GlideTuning> = {},
): GlidePath {
  // Per-field `??`, not `{ ...DEFAULT_GLIDE_TUNING, ...tuning }`: callers relay
  // an absent knob as an explicit `undefined` (a `glide` effect with no `rho`),
  // and a spread would overwrite the default with it.
  // Floored, not just defaulted: ρ = 0 makes the geodesic NaN and a NaN pose is
  // a dead camera (see GLIDE_RHO_MIN). The limit behaviour is already reached
  // around 0.05, so the clamp costs nothing anyone would want.
  const rho = Math.max(GLIDE_RHO_MIN, tuning.rho ?? DEFAULT_GLIDE_TUNING.rho);
  const velocity = tuning.velocity ?? DEFAULT_GLIDE_TUNING.velocity;
  const minSec = tuning.minSec ?? DEFAULT_GLIDE_TUNING.minSec;
  const maxSec = tuning.maxSec ?? DEFAULT_GLIDE_TUNING.maxSec;

  // w = 2·distance·tan(fovY/2) — fovY, not fovX, no aspect factor (§2.1).
  const halfTanFovY = Math.tan(fovYRad / 2);
  const w0 = 2 * from.distance * halfTanFovY;
  const w1 = 2 * to.distance * halfTanFovY;
  const du = distanceMpc(from.target, to.target);

  const geodesic = zoomPanGeodesic(0, w0, du, w1, rho);
  const durationSec = Math.max(minSec, Math.min(maxSec, geodesic.length / velocity));

  // The SAME curve measured from the far end. `u` is an offset along the
  // segment, so near the destination the forward `u` is a large number whose
  // useful part is its last few bits: `lerp(from, to, u/du)` then quantises the
  // target to one ULP of `du`. Measured Andromeda → Earth, that is 1.7e-16 Mpc
  // — 0.84 EARTH RADII — so the target visibly jumps frame to frame while the
  // camera is only 9e-16 Mpc away. Reading the offset from whichever endpoint
  // is nearer keeps it a small number computed directly, never a difference of
  // two large ones. Same class of fix as `zoomPanGeodesic`'s landmine 2.
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
    durationSec,
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
