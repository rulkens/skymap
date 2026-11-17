/**
 * orbitTrailView — the frame values an orbit-trail draw needs, picked out once.
 *
 * HARD INVARIANT: `slabVp` is `view.slab.vp`, NOT `view.vp`: `writeOrbitTrailRecord` inverts the
 * conic in f64 to resolve the cancellation between the ~1e-12 Mpc centres and the vp's large
 * translation column; fed the f32-narrowed `view.vp` it misplaces a trail by far more than its stroke.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { OrbitTrailView } from '../../../@types/rendering/orbitTrailRenderer/OrbitTrailView';
import { sampledDepthBinding } from './sampledDepthBinding';
import { sceneOccluderSpheres } from './sceneOccluderSpheres';

export function orbitTrailView(view: SlabView, ctx: FrameView, state: PassState): OrbitTrailView {
  return {
    slabVp: view.slab.vp,
    viewportPx: view.viewportPx,
    eyeMpc: ctx.drawCamPos,
    pxPerRad: ctx.drawPxPerRad,
    occluders: sceneOccluderSpheres(state, ctx),
    // The second occluder channel (terrain and meshes), in km like the eye-relative orbit points.
    depth: sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
    showImpostor: state.settings.debug.overlays['orbit-trail-impostor'],
  };
}
