/**
 * produceLightTimeCaptions — one non-clickable NEAR0 caption per visible
 * sphere, sitting on the top of its silhouette as the camera sees it. Reads
 * the same `deriveLightTimeLiveness` the sphere pass reads, so a caption can
 * never outlive or precede its sphere.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../../@types/camera/ImagePlaneBasis';
import type { Label2D } from '../../../@types/rendering/Label2D';
import type { Label2DProducer } from '../../../@types/engine/subsystems/Label2DProducer';
import { LIGHT_TIME_SPHERES } from '../../../data/lightTime/lightTimeSpheres';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { orbitForwardOf } from '../../../utils/camera/orbitForwardOf';
import { sphereSilhouetteTop } from '../../../utils/math/sphereSilhouetteTop';
import {
  CAPTION_PRIORITY,
  CAPTION_TIER_SCALE,
} from '../../../services/engine/presentation/captionPriority';
import { deriveLightTimeLiveness } from './deriveLightTimeLiveness';

/** Both clamps, so every sphere's caption is the same size on screen. */
const CAPTION_PX = 32;

export const produceLightTimeCaptions: Label2DProducer['produceLabels'] = (state, ctx) => {
  const liveness = deriveLightTimeLiveness(state, ctx);
  if (liveness === null) return { labels: [], awake: false };

  const fwd = orbitForwardOf(ctx.cam);
  const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };
  imagePlaneBasis(fwd, ctx.cam.roll ?? 0, frameUp(ctx.cam.upBasis), basis);
  // NEAR0 labels anchor eye-relative.
  const toCentre: Vec3 = [
    liveness.centre[0] - ctx.drawCamPos[0],
    liveness.centre[1] - ctx.drawCamPos[1],
    liveness.centre[2] - ctx.drawCamPos[2],
  ];

  const labels: Label2D[] = [];
  LIGHT_TIME_SPHERES.forEach((sphere, i) => {
    const opacity = liveness.opacities[i] ?? 0;
    if (!(opacity > 0)) return;
    labels.push({
      id: sphere.id,
      text: sphere.text,
      font: 'cormorant',
      pixelSize: 0,
      worldPos: sphereSilhouetteTop(toCentre, sphere.radiusMpc, basis.up, [0, 0, 0]),
      color: [0.75, 0.86, 1, 1],
      outlineColor: [0, 0, 0, 0.1],
      outlineEmFrac: 0.16,
      // The clamps fix the size; the radius just keeps the projection finite at every scale.
      worldEmMpc: sphere.radiusMpc,
      minPixelSize: CAPTION_PX,
      maxPixelSize: CAPTION_PX,
      alignX: 'center',
      alignY: 'bottom',
      fadeAlpha: opacity,
      prominencePx: CAPTION_PRIORITY.meshBody * CAPTION_TIER_SCALE,
    });
  });
  return { labels, awake: false };
};
