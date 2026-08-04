/**
 * sgrAStarCaptionTarget — the Galactic Centre caption's fade target for a given
 * camera, ahead of declutter.
 *
 * `foregroundLabelsLayer.draw` computes this inline for every caption by
 * indexing `CAPTION_FADE_RULES`. Two OTHER sites need the same number for this
 * ONE kind: the layer's `enabled` (this caption reaches past the solar system's
 * range, so it carries its own demand term) and `starPointsLayer`'s pick stamp
 * (the anchor draws nothing, so the caption is the entire affordance the click
 * follows). Both go through the rules table here rather than re-spelling the
 * gates and the band, which is what would let a "clickable but unnamed" or
 * "named but unclickable" frame exist.
 *
 * The anchor is static, so its position comes off the seed rather than the
 * frame's body-state snapshot — the same read `SCALE_FADE_BANDS` makes for R₀.
 * `camOrbitDistanceMpc` is `ctx.cam.distance`, threaded because the row TAKES it
 * even though this kind's band does not read it: passing the wrong quantity here
 * would be silent today and wrong the day the row grows a reach term.
 */

import { CAPTION_FADE_RULES } from './captionFadeRules';
import { SGR_A_STAR_ANCHOR } from '../../../data/bodies/sceneSgrAStar';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';
import type { Vec3 } from '../../../@types/math/Vec3';

export function sgrAStarCaptionTarget(
  settings: EngineSettingsState,
  camPosMpc: Readonly<Vec3>,
  camOrbitDistanceMpc: number,
): number {
  const rule = CAPTION_FADE_RULES.sgrAStar;
  if (!rule.labelEnabled(settings) || !rule.subjectVisible(settings)) return 0;
  return rule.fadeTarget(
    distanceMpc(camPosMpc, SGR_A_STAR_ANCHOR.positionMpc),
    camOrbitDistanceMpc,
  );
}
