/**
 * sgrAStarLensBandAlpha — this frame's Sgr A* lensing-band alpha. The lens pass
 * gates its draw on it; `starPointsLayer` must ALSO see it, to stand its
 * S-stars down exactly when `sStarLensedImagesLayer` takes them over. Two
 * copies of the lookup would drop or double a star at the band edge.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { regionById } from '../../../utils/scene/regionById';
import { regionRelativeDistanceMpc } from '../../../utils/scene/regionRelativeDistanceMpc';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../presentation/scaleFadeBands';
import { sceneBodyStates } from './sceneBodyStates';

const GALACTIC_CENTRE_REGION = regionById('galactic-centre');

export function sgrAStarLensBandAlpha(state: EngineState, ctx: ReadyFrameContext): number {
  const distMpc = regionRelativeDistanceMpc(
    ctx.drawCamPos,
    GALACTIC_CENTRE_REGION,
    sceneBodyStates(state, ctx),
  );
  return fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, distMpc);
}
