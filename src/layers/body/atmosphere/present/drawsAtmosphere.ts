/**
 * drawsAtmosphere — whether this view draws `bodyId`'s atmosphere: the body has one,
 * the view gives it a `body-m` slab (so it passed the view's frustum gate), and its
 * SURFACE disc clears `SUB_PIXEL_BODY_CULL_PX`. Surface, NOT atmosphere top: that
 * would hold the limb past the disc's own vanishing.
 */

import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PositionedId } from '../../../../@types/scene/PositionedId';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { ATMOSPHERE_BODIES } from '../data/atmosphereBodies';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { outerBoundRadiusM } from '../../../../utils/occlusion/outerBoundRadiusM';
import { SUB_PIXEL_BODY_CULL_PX } from '../../../../services/engine/frame/subPixelBodyCullPx';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';

export function drawsAtmosphere(bodyId: PositionedId, ctx: FrameView, state: PassState): boolean {
  const body = ATMOSPHERE_BODIES.find((candidate) => candidate.id === bodyId);
  if (body === undefined) return false;
  const hasSlab = ctx.slabs.some(
    (slab) => slab.frame.kind === 'body-m' && slab.frame.hostId === bodyId,
  );
  if (!hasSlab) return false;

  const positionMpc = sceneBodyStates(state, ctx).get(bodyId)!.positionMpc;
  const distanceMpc = Math.hypot(
    positionMpc[0] - ctx.drawCamPos[0],
    positionMpc[1] - ctx.drawCamPos[1],
    positionMpc[2] - ctx.drawCamPos[2],
  );
  // Zero distance = camera INSIDE the body, where apparentSizePx returns 0 and would read as sub-pixel.
  if (distanceMpc === 0) return true;
  const diameterPx = apparentSizePx({
    diameterKpc:
      (2 * outerBoundRadiusM(body.surface) * SCALE_UNITS.M_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
    distanceMpc,
    pxPerRad: ctx.drawPxPerRad,
  });
  return diameterPx >= SUB_PIXEL_BODY_CULL_PX;
}
