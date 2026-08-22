/**
 * labels3dNear0Layer — THROWAWAY (Quest 3 WebXR spike). NEAR0 sibling of
 * `labels3dLayer`: draws `label3DRendererNear0`, the second Label3D instance
 * for planet-scale content (`produceVrLabels`'s scene-body captions — see
 * `Label3DProducerOutput.labelsNear0`'s docblock). Additive into HDR, same
 * profile as the COSMO layer, joining the existing `(hdr, NEAR0)` render step
 * (frameProgram.ts) — no frame-program change needed.
 *
 * Precision: `produceVrLabels` places each NEAR0 label already rebased about
 * the frame's head position (`vrHeadWorldPos`) rather than absolute world
 * Mpc, which denormal-flushes at planet scale. This layer rebases the NEAR0
 * slab's vp about that SAME head position before drawing — mirroring
 * `near0LabelProjection`'s math, but NOT reusing that helper: it memoizes per
 * `ReadyFrameContext`, which the VR per-eye render loop reuses across both
 * eyes (`applyVrEyeToCtx` mutates one ctx twice), so a memoized rebase would
 * serve eye 0's vp to eye 1 (see `produceVrLabels`'s header for the identical
 * Label2D bug). Recomputed fresh every draw call instead.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { vrHeadWorldPos } from '../../../../utils/camera/vrHeadWorldPos';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { vrOverride } from '../../../xr/vrSpikeState';

/**
 * Rebase a NEAR0 slab's origin-relative f64 vp about the frame's head
 * position (also origin-relative, matching the slab's own frame), narrowed
 * for GPU upload. Exported for direct testing of the rebase math.
 */
export function near0VrRebasedVpF32(
  slabVpF64: Float64Array,
  headWorldPos: Readonly<Vec3>,
): Float32Array {
  const originRelHead: Vec3 = [
    headWorldPos[0] - RENDER_ORIGIN_MPC[0],
    headWorldPos[1] - RENDER_ORIGIN_MPC[1],
    headWorldPos[2] - RENDER_ORIGIN_MPC[2],
  ];
  return narrowMat4(rebaseViewProj(slabVpF64, originRelHead));
}

export const labels3dNear0Layer: ContentLayer = {
  name: 'labels3d-near0',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, _ctx) {
    const r = state.gpu.label3DRendererNear0;
    return r !== null && r.glyphCount() > 0;
  },

  draw(pass, view, _ctx, state) {
    // enabled() only passes when produceVrLabels emitted NEAR0 content, which
    // requires eyes.length > 0 this same frame — the guard is defensive.
    if (vrOverride.eyes.length === 0) return;
    const headWorldPos = vrHeadWorldPos(vrOverride.eyes);
    const vpF32 = near0VrRebasedVpF32(view.slab.vp, headWorldPos);
    state.gpu.label3DRendererNear0!.draw(pass, vpF32, view.viewportPx);
  },
};
