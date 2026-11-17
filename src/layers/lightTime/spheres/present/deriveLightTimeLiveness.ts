/**
 * deriveLightTimeLiveness — the one derivation of "which spheres draw this
 * frame, how strongly, and around what point", shared by the sphere pass and
 * the captions so the two cannot disagree: each hands its own value (the pass
 * its show value, the captions their label value). `null` when no sphere would draw.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { LightTimeLiveness } from '../@types/LightTimeLiveness';
import { LABEL_STYLES } from '../../../../data/labels/labelStyles';
import { subjectSizeFade } from '../../../../utils/labels/subjectSizeFade';
import { EARTH_REF } from '../../../../data/selection/earthRef';
import { LIGHT_TIME_SPHERES } from '../data/lightTimeSpheres';

export function deriveLightTimeLiveness(
  ctx: Pick<FrameView, 'snapshot' | 'drawCamPos' | 'drawPxPerRad' | 'canvasSize'>,
  layerOpacity: number,
): LightTimeLiveness | null {
  if (!(layerOpacity > 0)) return null;
  const centre = ctx.snapshot.bodyStates.get(EARTH_REF.id)?.positionMpc;
  if (centre === undefined) return null;

  // Earth sits ~1 AU from the world origin, far more than the smallest radii,
  // so the distance must be measured from Earth and in f64.
  const camDistMpc = Math.hypot(
    ctx.drawCamPos[0] - centre[0],
    ctx.drawCamPos[1] - centre[1],
    ctx.drawCamPos[2] - centre[2],
  );
  // The caption's own rule over the sphere's apparent diameter in pixels (the style's appear
  // band, and gone as the sphere fills the view), so a sphere and its caption dim together.
  const shortSidePx = Math.min(ctx.canvasSize.width, ctx.canvasSize.height);
  const opacities = LIGHT_TIME_SPHERES.map(
    (sphere) =>
      layerOpacity *
      subjectSizeFade(
        LABEL_STYLES.lightTime,
        ((2 * sphere.radiusMpc) / camDistMpc) * ctx.drawPxPerRad,
        shortSidePx,
      ),
  );
  return opacities.some((opacity) => opacity > 0) ? { centre, opacities } : null;
}
