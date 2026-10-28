/**
 * atmosphereShellPass — the in-scatter atmosphere: a proxy sphere at the atmosphere-TOP
 * radius in the depth-bearing `foreground:0` target, OUTSIDE the shell only. A camera it
 * encloses is `aerial-perspective`'s; exactly one of the two draws per body per frame or the
 * in-scatter doubles. Expanded to one step per body-m row, so `enabled`/`draw` run PER BODY on
 * `view.slab.frame.hostId`. Non-pickable (a translucent halo), so no `drawPick`.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import { atmosphereDrawList } from '../present/atmosphereDrawList';
import { atmosphereShellUniforms } from '../present/atmosphereShellUniforms';
import { sampledDepthBinding } from '../../../services/engine/frame/sampledDepthBinding';

export function atmosphereShellPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'atmosphere-shell',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      const bodyId = view.slab.frame.hostId;
      return atmosphereDrawList(state, ctx).some(
        (entry) => entry.body.id === bodyId && !entry.inside,
      );
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodyId = view.slab.frame.hostId;
      const entry = atmosphereDrawList(state, ctx).find((e) => e.body.id === bodyId);
      if (entry === undefined) return;
      // Every ray the fragment classifies ends at the depth this row's opaque passes stamped.
      runtime.atmosphereShellRenderer.draw(
        pass,
        entry.body.id,
        atmosphereShellUniforms(entry, view.slab, ctx, state),
        {
          ...sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
          viewportPx: view.viewportPx,
          // The fragment marches in atmosphere-top units; the depth reconstructs km.
          kmToLocal: 1 / entry.params.atmosphereTopKm,
        },
      );
    },
  };
}
