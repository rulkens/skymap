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
import { CAPTION_FADE_RULES } from '../../../services/engine/presentation/captionFadeRules';
import { GLINT_MIN_BRIGHTNESS } from '../../../data/rendering/glintMinBrightness';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { blackHoleMarkerBrightness } from './blackHoleMarkerBrightness';

export function blackHolePickable(row: BlackHoleRow, state: PassState, ctx: FrameView): boolean {
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
  const states = sceneBodyStates(state, ctx);
  if (blackHoleMarkerBrightness(row, ctx.drawCamPos, states) > GLINT_MIN_BRIGHTNESS) return true;
  const anchor = states.get(row.anchorId);
  if (anchor === undefined) return false;
  // The caption's own rules row, not a re-spelled gate and band, so the click
  // cannot outlive the name or the name outlive the click.
  const rule = CAPTION_FADE_RULES.sgrAStar;
  if (!rule.labelEnabled(state.settings) || !rule.subjectVisible(state.settings)) return false;
  return rule.fadeTarget(distanceMpc(ctx.drawCamPos, anchor.positionMpc), ctx.cam.distance) > 0;
}
