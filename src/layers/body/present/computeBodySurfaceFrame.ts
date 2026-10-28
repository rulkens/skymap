import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { PreparedBodySurfaceFrame } from '../../../@types/engine/frame/PreparedBodySurfaceFrame';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import { sceneBodyForId } from './sceneBodyForId';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';

export function computeBodySurfaceFrame(
  state: PassState,
  ctx: FrameView,
  bodyId: PositionedId,
): PreparedBodySurfaceFrame | null {
  const body = sceneBodyForId(bodyId);
  if (body === null) return null;
  const bodyState = sceneBodyStates(state, ctx).get(bodyId);
  if (bodyState === undefined) return null;
  // Must be the pose `deriveSlabs` built this slab's `vp` from, or eyeRelBodyM drifts off its basis.
  const pose = ctx.bodyPose(bodyId);
  if (pose === null) return null;
  return { body, bodyState, pose, radiusM: body.surface.datumRadiusM };
}
