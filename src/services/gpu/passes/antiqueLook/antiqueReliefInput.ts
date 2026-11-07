/**
 * antiqueReliefInput — the relief pass's frame, or null when it has no ground to
 * engrave: foreground:0's depth must come from the row of an `ANTIQUE_RELIEF_BODIES`
 * body, close enough that its relief shows. The row's own `vp` and pose, so the depth
 * unprojects into the frame it was drawn in.
 */

import type { AntiqueReliefInput } from '../../../../@types/rendering/AntiqueReliefInput';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { SampledDepth } from '../../../../@types/engine/frame/SampledDepth';
import {
  ANTIQUE_RELIEF_BODIES,
  ANTIQUE_RELIEF_MAX_ALT_M,
} from '../../../../data/rendering/antiqueRelief';
import {
  ANTIQUE_BODY_PRINTS,
  ANTIQUE_BODY_PRINT_CODES,
} from '../../../../data/rendering/antiquePlateBodies';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { sunDirLocal } from '../../../../utils/camera/bodyCompose/sunDirLocal';
import { antiqueMapDetail } from '../../../../utils/gpu/antiqueLook/antiqueMapDetail';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { sceneBodyStates } from '../../../engine/frame/sceneBodyStates';

export function antiqueReliefInput(
  state: PassState,
  ctx: FrameView,
  depth: SampledDepth,
  unitPx: number,
): AntiqueReliefInput | null {
  const row = depth.row;
  if (row === null || row.frame.kind !== 'body-m') return null;
  const hostId = row.frame.hostId;
  const reliefBody = ANTIQUE_RELIEF_BODIES[hostId];
  if (reliefBody === undefined) return null;
  const body = SCENE_CELESTIAL_BODIES.find((b) => b.id === hostId);
  const pose = ctx.bodyPose(hostId);
  const bodyState = sceneBodyStates(state, ctx).get(hostId);
  if (body === undefined || pose === null || bodyState === undefined) return null;
  const datumRadiusM = body.surface.datumRadiusM;
  const eyeR = Math.hypot(...pose.eyeRelBodyM);
  if (eyeR - datumRadiusM > ANTIQUE_RELIEF_MAX_ALT_M) return null;
  // The map's own reveal level, from the same inner-bound altitude its signs use.
  const band = reliefBody.revealDetail;
  const detail = antiqueMapDetail(ctx.drawPxPerRad / unitPx, (eyeR - innerBoundRadiusM(body.surface)) / 1000);
  const reveal = band === null ? 1 : smoothstep(band[0], band[1], detail);
  if (reveal <= 0) return null;
  return {
    vp: row.vp,
    eyeRelBodyM: pose.eyeRelBodyM,
    datumRadiusM,
    body: reliefBody,
    print: ANTIQUE_BODY_PRINT_CODES[ANTIQUE_BODY_PRINTS[hostId] ?? 'plain'],
    reveal,
    sun: sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation),
    size: ctx.canvasSize,
    unitPx,
    radPerPx: 1 / ctx.drawPxPerRad,
    lightElevationDeg: state.settings.antique.tuning.reliefLightDeg,
  };
}
