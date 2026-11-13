/**
 * antiqueMilkyWayNameAlpha — how strongly the antique plate letters the Milky Way's
 * parts this frame, per `ANTIQUE_MILKY_WAY_NAME_REVEAL`: 0 with the look off, from
 * inside the disc, edge-on, or with the disc too small on screen to carry its arms.
 */

import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import { ANTIQUE_MILKY_WAY_NAME_REVEAL } from '../../../../data/labels/antiqueMilkyWayNameReveal';
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../../data/milkyWay/galacticCenter';
import { MILKY_WAY_MODEL_SCALE } from '../../../../data/milkyWay/milkyWayModelScale';
import { milkyWayCamPosModel } from '../../cloud/render/milkyWayCamPosModel';
import { antiqueLookOn } from '../../../../utils/render/antiqueLookOn';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { smoothstep } from '../../../../utils/math/smoothstep';

export function antiqueMilkyWayNameAlpha(state: EngineState, ctx: FrameView): number {
  if (!antiqueLookOn(state)) return 0;
  const { discPx, outsideKpc, faceCos } = ANTIQUE_MILKY_WAY_NAME_REVEAL;
  // The eye in the generator's disc frame: +y is the pole, one unit MILKY_WAY_MODEL_SCALE Mpc.
  const eye = milkyWayCamPosModel(ctx.drawCamPos);
  const eyeUnits = Math.hypot(eye[0], eye[1], eye[2]);
  const eyeMpc = eyeUnits * MILKY_WAY_MODEL_SCALE;
  const discSizePx = apparentSizePx({
    diameterKpc: 2 * MILKY_WAY_DISC_RADIUS_KPC,
    distanceMpc: eyeMpc,
    pxPerRad: ctx.drawPxPerRad,
  });
  return (
    smoothstep(discPx[0], discPx[1], discSizePx) *
    smoothstep(outsideKpc[0], outsideKpc[1], eyeMpc * 1000) *
    smoothstep(faceCos[0], faceCos[1], Math.abs(eye[1]) / Math.max(eyeUnits, 1e-9))
  );
}
