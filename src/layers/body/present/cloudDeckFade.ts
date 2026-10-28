/**
 * cloudDeckFade: the cloud shell's visibility (0..1) as the camera descends.
 * Keyed on ALTITUDE, not the tile planner's `zWin`, which moves independently of
 * camera position (tier, LOD bias, a 404'd manifest resolving no level) and so
 * cannot be trusted to fade the deck exactly when no tile data exists. Edges are
 * the named fields of `CLOUD_SHELL_PARAMS`. `bodyRadiusMpc <= 0` returns 1 (fail
 * open onto "draw it", never NaN).
 */

import { CLOUD_SHELL_PARAMS } from './cloudShellParams';
import { fadeBand } from '../../../utils/math/fadeBand';

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
