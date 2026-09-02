/**
 * starPointDrawParams — the appearance every `StarPointRenderer` draw shares:
 * the user's dot size, the exposure-ramped brightness, and the backdrop
 * dissolve alpha.
 *
 * Two layers now feed that renderer — `starPointsLayer` and the S-stars'
 * `sStarLensedImagesLayer`, which takes the S-stars over inside the lens band.
 * The handoff has to be invisible, so the composition (which band, which region
 * anchor, which ramp inputs) lives here once rather than in both.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../@types/math/Vec3';
import { fadeBand } from '../../../utils/math/fadeBand';
import { regionById } from '../../../utils/scene/regionById';
import { regionRelativeDistanceMpc } from '../../../utils/scene/regionRelativeDistanceMpc';
import { starExposureRamp } from '../../gpu/renderers/starCatalog/starExposureRamp';
import { SCALE_FADE_BANDS } from '../presentation/scaleFadeBands';
import { sceneBodyStates } from './sceneBodyStates';

// The scale regime the star backdrop belongs to. Its anchor — not the render
// origin — is what the dissolve band measures the camera against, so the band
// keeps meaning the moment a star map is seeded somewhere other than the Sun.
const STAR_BACKDROP_REGION = regionById('solar-neighbourhood');

export function starPointDrawParams(
  state: EngineState,
  ctx: ReadyFrameContext,
  camPosMpc: Readonly<Vec3>,
): { sizePx: number; brightness: number; backdropFade: number } {
  const { sizePx, brightness, exposureNearX, exposureMidX, exposureFarX } =
    state.settings.starCatalogs;
  // Keyed on the camera's HELIOCENTRIC Mpc distance — the ramp's own input unit
  // — the same fold `starCatalogLayer` applies, so a seeded star and a survey
  // leaf of equal absMag render identically.
  const camDistMpc = Math.hypot(camPosMpc[0], camPosMpc[1], camPosMpc[2]);
  return {
    sizePx,
    brightness:
      brightness * starExposureRamp(camDistMpc, exposureNearX, exposureMidX, exposureFarX),
    backdropFade: fadeBand(
      SCALE_FADE_BANDS.starBackdrop,
      regionRelativeDistanceMpc(camPosMpc, STAR_BACKDROP_REGION, sceneBodyStates(state, ctx)),
    ),
  };
}
