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
import { DEFAULT_GLIDE_TUNING } from './glideCalibration';
import { distanceMpc } from '../math/distanceMpc';
import { lerp } from '../math/lerp';

export function glidePath(
  from: { readonly target: Vec3; readonly distance: number },
  to: { readonly target: Vec3; readonly distance: number },
  fovYRad: number,
  tuning: Partial<GlideTuning> = {},
): GlidePath {
  // Per-field `??`, not `{ ...DEFAULT_GLIDE_TUNING, ...tuning }`: callers relay
  // an absent knob as an explicit `undefined` (a `glide` effect with no `rho`),
  // and a spread would overwrite the default with it.
  const rho = tuning.rho ?? DEFAULT_GLIDE_TUNING.rho;
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

  return {
    durationSec,
    at: (arcFrac: number) => {
      const { u, w } = geodesic.at(arcFrac * geodesic.length);
      // du === 0 ⇒ u stays u0 (=0) throughout — the degenerate branch never
      // moves along the target segment, so lifting u/du here would be 0/0.
      const t = du === 0 ? 0 : u / du;
      return {
        target: [
          lerp(from.target[0], to.target[0], t),
          lerp(from.target[1], to.target[1], t),
          lerp(from.target[2], to.target[2], t),
        ],
        distance: w / (2 * halfTanFovY),
      };
    },
  };
}
