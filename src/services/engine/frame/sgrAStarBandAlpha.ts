/**
 * sgrAStarBandAlpha — this frame's `sgrAStarLensing` fade-band alpha, the
 * lens's zero-dispatch gate.
 *
 * Keyed off the capture row's own anchor + band rather than a second copy of
 * them: the lens draws the sky that row bakes, so a band the two disagreed on
 * would expand a lens step over a cubemap nothing had captured into.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { fadeBand } from '../../../utils/math/fadeBand';
import { regionRelativeDistanceMpc } from '../../../utils/scene/regionRelativeDistanceMpc';
import { sceneBodyStates } from './sceneBodyStates';

export function sgrAStarBandAlpha(state: PassState, ctx: ReadyFrameContext): number {
  const capture = CUBEMAP_CAPTURES.sgrAStar;
  const distanceMpc = regionRelativeDistanceMpc(
    ctx.drawCamPos,
    capture.anchor,
    sceneBodyStates(state, ctx),
  );
  return fadeBand(capture.band, distanceMpc);
}
