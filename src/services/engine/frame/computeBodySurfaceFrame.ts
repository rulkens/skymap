import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { PreparedBodySurfaceFrame } from '../../../@types/engine/frame/PreparedBodySurfaceFrame';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import { sceneBodyForId } from './sceneBodyForId';
import { sceneBodyStates } from './sceneBodyStates';

export function computeBodySurfaceFrame(
  state: PassState,
  ctx: FrameView,
  bodyId: PositionedId,
): PreparedBodySurfaceFrame | null {
  const body = sceneBodyForId(state, bodyId);
  if (body === null) return null;
  const bodyState = sceneBodyStates(state, ctx).get(bodyId);
  if (bodyState === undefined) return null;
  // The SAME pose-provider closure `deriveSlabs` was fed to build this
  // body's slab row (see FrameView.bodyPose's doc) — reading it here
  // instead of re-deriving the pose is what keeps this layer's eyeRelBodyM
  // from ever drifting off the basis the slab's `vp` was actually built from.
  const pose = ctx.bodyPose(bodyId);
  if (pose === null) return null;
  return { body, bodyState, pose, radiusM: body.surface.datumRadiusM };
}
