/**
 * blackHolePickable — whether a hole takes clicks this frame: while its marker
 * shows OR its caption does. Inside the lens band the marker has faded and the
 * lens is a fullscreen triangle that cannot stamp a point, so the caption
 * carries the click there. `pickEnabled` and `drawPick` both call this, so the
 * gate and the stamp cannot disagree. Past the foreground gate the NEAR0 group
 * is skipped, so a stamp there could never rasterise.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../services/engine/frame/foregroundMaxDistance';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { GLINT_MIN_BRIGHTNESS } from '../../../data/rendering/glintMinBrightness';
import { blackHoleMarkerBrightness } from './blackHoleMarkerBrightness';
import { sgrAStarCaptionTarget } from './sgrAStarCaptionTarget';

export function blackHolePickable(row: BlackHoleRow, state: PassState, ctx: FrameView): boolean {
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
  const markerBrightness = blackHoleMarkerBrightness(
    row,
    ctx.drawCamPos,
    sceneBodyStates(state, ctx),
  );
  return (
    markerBrightness > GLINT_MIN_BRIGHTNESS ||
    sgrAStarCaptionTarget(state.settings, ctx.drawCamPos, ctx.cam.distance) > 0
  );
}
