/**
 * cloudDeckFade — the Earth cloud shell's visibility (0..1) as the camera
 * descends toward the surface it floats above.
 *
 * ## Why ALTITUDE, not the tile planner's `zWin`
 *
 * The obvious trigger is `zWin`, the surface virtual texture's resolved
 * page-table level (`planEarthTiles`): fade the clouds as finer tiles commit,
 * since that is the moment a low-resolution whole-globe map starts smearing
 * over something sharper. That was rejected. `zWin` is downstream of the
 * texture tier and the LOD bias — a different tier setting or a throttled
 * connection moves it independently of where the camera actually is — and a
 * session whose tile manifest 404s never resolves a level at all, so the deck
 * would never fade under exactly the circumstance (no tile data) where it is
 * loudest about smearing over nothing. Altitude above the surface is the
 * physical fact instead: it exists whether or not a single tile ever loads,
 * and it is the quantity that actually answers "is the camera close enough
 * that a whole-globe cloud map reads as visibly coarser than the ground
 * beneath it."
 *
 * ## The band — calibrated against the tile planner's own thresholds
 *
 * At the app's real default vertical FOV (`DEFAULT_FOV_Y_RAD` = 60°) and a
 * representative 900 px-tall viewport, `planEarthTiles` settles at z6 around
 * 476 km altitude and z7 around 238 km — 0.075 and 0.037 Earth radii (Earth's
 * radius is 6371 km). The fade starts at the z6 altitude (the deck is still
 * doing its normal whole-globe job there) and completes by the z7 altitude
 * (fine surface tiles are now the thing worth looking at, and the deck would
 * only smear over them). See `CLOUD_SHELL_PARAMS`'s own header for the full
 * derivation, the caveat that this is a calibration against a default
 * viewport rather than an identity, and why: the two edges live as named
 * fields there, not as literals here, because they are deck dials and belong
 * with the deck's other dials (`radiusRatio`, `opacity`); this util owns only
 * the curve, the same split `clampDistance` documents between "callers pass a
 * measurement" and "the policy lives in the util".
 *
 * `fadeBand` supplies the smoothstep, not a linear ramp — a linear ramp would
 * leave a visible kink at both ends of a fade this slow — and its edge
 * ordering (`fullAt > goneAt` fades OUT as the value drops) already matches
 * this fade's direction: full visibility at the higher altitude, gone at the
 * lower one.
 *
 * `bodyRadiusMpc <= 0` is a degenerate caller input (no body to measure
 * altitude against), so it returns 1 (fully visible) rather than dividing by
 * zero — a bad measurement fails open onto "draw it," not onto a NaN that
 * would otherwise propagate into an opacity multiply.
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
