/**
 * atmosphereShellPass — the in-scatter atmosphere as a `'body'`-slab row in the depth-bearing
 * `foreground:0` target (spec §8.3): a proxy sphere at the atmosphere-TOP radius, OUTSIDE the
 * shell only — a camera it encloses is `aerial-perspective`'s, and exactly one of the two draws
 * runs per body per frame or the in-scatter doubles. The frame program expands it to one step
 * per body-m row, so `enabled`/`draw` run once PER BODY on `view.slab.frame.bodyId`. Non-pickable (a translucent halo has no clickable silhouette), so no `drawPick`.
 * Argued elsewhere: bake↔draw equality in `atmosphereDrawList`, the shell itself in
 * `atmosphereShellRenderer` + `shell/fragment.wesl`, this row's order in `frameOrder.ts`, the
 * uniform record in `atmosphereShellUniforms`.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { atmosphereDrawList } from '../atmosphereDrawList';
import { atmosphereShellUniforms } from '../atmosphereShellUniforms';

export const atmosphereShellPass: ContentPass = {
  name: 'atmosphere-shell',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    // Handle first, so pre-bootstrap fixtures (null renderer, bare ctx) never touch body inputs.
    if (state.gpu.atmosphereShellRenderer === null) return false;
    const bodyId = view.slab.frame.bodyId;
    return atmosphereDrawList(state, ctx).some(
      (entry) => entry.body.id === bodyId && !entry.inside,
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.atmosphereShellRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const bodyId = view.slab.frame.bodyId;
    const entry = atmosphereDrawList(state, ctx).find((e) => e.body.id === bodyId);
    if (entry === undefined) return;
    renderer.draw(pass, entry.body.id, atmosphereShellUniforms(entry, view.slab, ctx, state));
  },
};
