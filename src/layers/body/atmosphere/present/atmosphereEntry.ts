/**
 * atmosphereEntry — one atmosphere body resolved from one view: its params row and
 * the pose-dependent values the sky-view bake and the shell draws share. Pure
 * geometry: whether the body draws at all is `drawsAtmosphere`'s call. Null for a
 * body with no atmosphere or no pose, so consumers read the fields unguarded.
 */

import type { AtmosphereDrawEntry } from '../@types/AtmosphereDrawEntry';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PositionedId } from '../../../../@types/scene/PositionedId';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { ATMOSPHERE_PARAMS } from '../data/atmosphereParams';
import { ATMOSPHERE_BODIES } from '../data/atmosphereBodies';
import { bodySlabCamLocal } from '../../../../utils/camera/bodyCompose/bodySlabCamLocal';
import { sunDirLocal } from '../../../../utils/camera/bodyCompose/sunDirLocal';
import { hostBandOpen } from '../../../../utils/frame/hostBandOpen';
import { atmosphereInsideBand } from './atmosphereInsideBand';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';

export function atmosphereEntry(
  bodyId: PositionedId,
  ctx: FrameView,
  state: PassState,
): AtmosphereDrawEntry | null {
  const body = ATMOSPHERE_BODIES.find((candidate) => candidate.id === bodyId);
  // The pose `deriveSlabs` built this body's row from.
  const pose = ctx.bodyPose(bodyId);
  if (body === undefined || pose === null) return null;
  const params = ATMOSPHERE_PARAMS[body.id]!;
  // Live position + orientation from the per-frame snapshot, not baked record fields.
  const bodyState = sceneBodyStates(state, ctx).get(body.id)!;
  const atmosphereTopM = params.atmosphereTopKm * SCALE_UNITS.KM_TO_M;
  return {
    body,
    params,
    atmosphereTopM,
    camLocal: bodySlabCamLocal(pose.eyeRelBodyM, atmosphereTopM),
    sunLocal: sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation),
    // The rule the body's slab row hosts the aerial line by, so the two agree.
    inside: hostBandOpen(atmosphereInsideBand(body.id), ctx, body.id),
  };
}
