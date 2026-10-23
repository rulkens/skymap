import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { PreparedBodySurfaceFrame } from '../../../@types/engine/frame/PreparedBodySurfaceFrame';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../utils/camera/bodySlabCamLocal';
import { sceneBodyForId } from './sceneBodyForId';
import { sceneBodyStates } from './sceneBodyStates';

export function computeBodySurfaceFrame(
  state: PassState,
  ctx: FrameView,
  view: SlabView,
  bodyId: PositionedId,
): PreparedBodySurfaceFrame | null {
  const body = sceneBodyForId(state, bodyId);
  if (body === null) return null;
  const bodyState = sceneBodyStates(state, ctx).get(bodyId);
  if (bodyState === undefined) return null;
  // The SAME pose-provider closure `deriveSlabs` was fed to build this
  // body's slab row (see FrameView.bodyPose's doc) — reading it here
  // instead of re-deriving the pose is what keeps this layer's eyeRelBodyM
  // from ever drifting off the basis `view.slab.vp` was actually built from.
  const pose = ctx.bodyPose(bodyId);
  if (pose === null) return null;
  // Datum, not a bound: tiles displace off the datum sphere, so the mvp scale and
  // the radius the tile cut is planned against must be that same number. F2 shrinks
  // only the BASE globe (to the inner bound) so relief cannot poke through it (§7.4).
  const radiusM = body.surface.datumRadiusM;
  // See composeBodySlabMvp's header: the seam already rotated the camera into
  // the body's fixed axes, so view.slab.vp (built about the eye from that
  // SAME basis) is what this composes against — never the f32-narrowed view.vp.
  const mvpLocal = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, radiusM);
  const camLocal = bodySlabCamLocal(pose.eyeRelBodyM, radiusM);
  return { body, bodyState, pose, radiusM, mvpLocal, camLocal };
}
