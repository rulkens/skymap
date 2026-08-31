/**
 * cloudDeckFade — the Earth cloud shell's visibility (0..1) as the camera
 * descends toward the surface it floats above.
 *
 * Triggered by ALTITUDE, not the tile planner's resolved level (`zWin`):
 * `zWin` moves independently of camera position (tier, LOD bias, a 404'd
 * manifest resolving no level at all), so it can't be trusted to fade the
 * deck exactly when there's no tile data to smear over. Altitude is the
 * physical fact that exists regardless of whether a tile ever loads.
 *
 * The band is calibrated against `cutSurfaceTiles`'s own thresholds: at the
 * default FOV and viewport it settles at z6 ~0.075 Earth radii of altitude
 * and z7 ~0.037. The fade starts at z6 (the deck still does its whole-globe
 * job) and completes by z7 (fine tiles are now the thing worth looking at).
 * The two edges live as named fields on `CLOUD_SHELL_PARAMS`, not literals
 * here — see that constant's header for the derivation.
 *
 * `fadeBand` supplies the smoothstep (a linear ramp would kink); its edge
 * ordering (`fullAt > goneAt`) matches this fade's direction.
 *
 * `bodyRadiusMpc <= 0` returns 1 (fully visible) rather than dividing by
 * zero — a bad measurement fails open onto "draw it," never a NaN.
 */

import { CLOUD_SHELL_PARAMS } from '../../data/bodies/cloudShellParams';
import { fadeBand } from '../math/fadeBand';

export function cloudDeckFade(cameraDistanceMpc: number, bodyRadiusMpc: number): number {
  if (bodyRadiusMpc <= 0) return 1;
  const altitudeRadii = cameraDistanceMpc / bodyRadiusMpc - 1;
  return fadeBand(
    {
      fullAt: CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii,
      goneAt: CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii,
    },
    altitudeRadii,
  );
}
