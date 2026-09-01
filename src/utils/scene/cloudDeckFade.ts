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
 * The fade starts (`fullAt`) at the z6 tile-LOD crossover altitude (the deck
 * still does its whole-globe job at that resolution). `goneAt` no longer
 * tracks a tile-LOD crossover — Task 10 lowered it into the shell's own
 * radius so the deck stays visible descending through it (see
 * `CLOUD_SHELL_PARAMS`'s header). The two edges live as named fields there,
 * not literals here.
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
