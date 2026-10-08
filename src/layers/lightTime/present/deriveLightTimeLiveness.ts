/**
 * deriveLightTimeLiveness — the one derivation of "which spheres draw this
 * frame, how strongly, and around what point", shared by the sphere pass and
 * the captions so the two cannot disagree. `null` when no sphere would draw.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { LightTimeLiveness } from '../@types/LightTimeLiveness';
import { EARTH_REF } from '../../../data/selection/earthRef';
import { LIGHT_TIME_SPHERES } from '../../../data/lightTime/lightTimeSpheres';
import { resolveLayerOpacity } from '../../../services/engine/presentation/focusRecession';
import { lightTimeSphereOpacity } from './lightTimeSphereOpacity';

export function deriveLightTimeLiveness(
  state: PassState,
  ctx: FrameView,
): LightTimeLiveness | null {
  const layerOpacity = resolveLayerOpacity(state, ctx, { kind: 'lightTime' });
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
  const opacities = LIGHT_TIME_SPHERES.map(
    (sphere) => layerOpacity * lightTimeSphereOpacity(camDistMpc, sphere.radiusMpc),
  );
  return opacities.some((opacity) => opacity > 0) ? { centre, opacities } : null;
}
