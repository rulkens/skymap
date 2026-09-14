/**
 * aerialPerspectivePass — the inside-the-shell sibling of `atmosphere-shell`:
 * exactly one of the two draws per body per frame, or the in-scatter doubles.
 * Its `FRAME_ORDER` line declares `depth: 'sample'`, so this pass's step opens
 * with NO depth attachment and binds `foreground:0`'s depth as a TEXTURE
 * instead — WebGPU forbids sampling a view attached to the same pass — which is
 * what lets the fog key on scene distance rather than the ground sphere alone.
 * Argued elsewhere: this row's order in `frameOrder.ts`, the froxel volume in
 * `aerialPerspectiveRenderer`, the uniform record in `atmosphereShellUniforms`.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { atmosphereDrawList } from '../atmosphereDrawList';
import { atmosphereShellUniforms } from '../atmosphereShellUniforms';

export const aerialPerspectivePass: ContentPass = {
  name: 'aerial-perspective',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    // Handle first, so pre-bootstrap fixtures (null renderer, bare ctx) never touch body inputs.
    if (state.gpu.atmosphereShellRenderer === null) return false;
    const bodyId = view.slab.frame.bodyId;
    return atmosphereDrawList(state, ctx).some((entry) => entry.body.id === bodyId && entry.inside);
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.atmosphereShellRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const bodyId = view.slab.frame.bodyId;
    const entry = atmosphereDrawList(state, ctx).find((e) => e.body.id === bodyId);
    if (entry === undefined) return;
    renderer.drawAerialPerspective(
      pass,
      entry.body.id,
      atmosphereShellUniforms(entry, view.slab, ctx, state),
      ctx.renderTargets.depthViewOf('foreground:0'),
    );
  },
};
