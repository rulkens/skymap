/**
 * blackHolePickable — whether the marker pass stamps a hole this frame: while its
 * marker shows. Inside the lens band the marker has faded and the lens is a
 * fullscreen triangle that cannot stamp a point, so the caption's own ink box
 * (`labelsNearPass.drawPick`, packing the same selection id) takes the click there.
 * `pickEnabled` and `drawPick` both call this, so the gate and the stamp cannot
 * disagree. Past the foreground gate the NEAR0 group is skipped, so a stamp there
 * could never rasterise.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../services/engine/frame/foregroundMaxDistance';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { GLINT_MIN_BRIGHTNESS } from '../../../data/rendering/glintMinBrightness';
import { blackHoleMarkerBrightness } from './blackHoleMarkerBrightness';

export function blackHolePickable(row: BlackHoleRow, state: PassState, ctx: FrameView): boolean {
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
  const states = sceneBodyStates(state, ctx);
  return blackHoleMarkerBrightness(row, ctx.drawCamPos, states) > GLINT_MIN_BRIGHTNESS;
}
