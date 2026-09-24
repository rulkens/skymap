/**
 * sgrAStarCaptionTarget — the Galactic Centre caption's fade target for a given
 * camera, ahead of declutter. `blackHolePickable` reads it so the marker's pick
 * stamp follows the caption through the rules row the caption itself composes
 * from, rather than re-spelling its gates and band. The anchor is static, so
 * its position comes off the seed. `camOrbitDistanceMpc` is `ctx.cam.distance`:
 * the row takes it though this kind's band does not read it, and passing the
 * wrong quantity would be silent until the row grows a reach term.
 */

import { CAPTION_FADE_RULES } from '../../../services/engine/presentation/captionFadeRules';
import { GALACTIC_CENTRE_ANCHOR } from '../../../data/places/galacticCentre';
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
    distanceMpc(camPosMpc, GALACTIC_CENTRE_ANCHOR.positionMpc),
    camOrbitDistanceMpc,
  );
}
