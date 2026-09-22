/**
 * aerialPerspectivePass — the inside-the-shell sibling of `atmosphere-shell`:
 * exactly one of the two draws per body per frame, or the in-scatter doubles.
 * Its `FRAME_ORDER` line samples `foreground:0`'s depth and it hands the
 * renderer that texture (`view.sampledDepth`, the apply fragment's binding 8),
 * so the fog keys on scene distance, not the analytic ground sphere alone.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { atmosphereDrawList } from '../atmosphereDrawList';

export const aerialPerspectivePass: ContentPass = {
  name: 'aerial-perspective',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    // Handle first, so pre-bootstrap fixtures (null renderer, bare ctx) never touch body inputs.
    if (state.gpu.atmosphereShellRenderer === null) return false;
    const bodyId = view.slab.frame.hostId;
    return atmosphereDrawList(state, ctx).some((entry) => entry.body.id === bodyId && entry.inside);
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.atmosphereShellRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const bodyId = view.slab.frame.hostId;
    const entry = atmosphereDrawList(state, ctx).find((e) => e.body.id === bodyId);
    if (entry === undefined) return;
    renderer.drawAerialPerspective(pass, entry.body.id, view.sampledDepth!.view);
  },
};
