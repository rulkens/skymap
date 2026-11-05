/**
 * skyCaptureBandAlpha — this frame's fade-band alpha for one sky capture row,
 * the zero-dispatch gate of whatever samples that row (the lens, a probe's
 * sky blit).
 *
 * Keyed off the capture row's own anchor + band rather than a second copy of
 * them: the consumer draws the sky that row bakes, so a band the two disagreed
 * on would sample a cubemap nothing had captured into.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SkyCaptureKey } from '../../../@types/rendering/SkyCaptureKey';
import { APP_CUBEMAP_CAPTURE_REGISTRY } from '../../../compositions/appCubemapCaptures';
import { fadeBand } from '../../../utils/math/fadeBand';
import { regionRelativeDistanceMpc } from '../../../utils/regions/regionRelativeDistanceMpc';
import { sceneBodyStates } from './sceneBodyStates';

export function skyCaptureBandAlpha(key: SkyCaptureKey, state: PassState, ctx: FrameView): number {
  const capture = APP_CUBEMAP_CAPTURE_REGISTRY[key];
  const distanceMpc = regionRelativeDistanceMpc(
    ctx.drawCamPos,
    capture.anchor,
    sceneBodyStates(state, ctx),
  );
  return fadeBand(capture.band, distanceMpc);
}
