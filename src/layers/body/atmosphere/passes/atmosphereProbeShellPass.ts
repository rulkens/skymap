/**
 * atmosphereProbeShellPass — the outside atmosphere shell in a mesh probe captured from
 * OUTSIDE it (a craft in orbit), so the reflected planet carries its haze and limb glow.
 * The complement of `atmosphere-probe-sky`: both gate on the FACE ctx's eye, so exactly one
 * draws per probe. Drawn after the ground passes, which it attenuates and lights. The
 * sky-view LUT it samples is baked for the main camera's altitude, not the probe's.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { atmosphereEntry } from '../present/atmosphereEntry';
import { drawsAtmosphere } from '../present/drawsAtmosphere';
import { atmosphereShellUniforms } from '../present/atmosphereShellUniforms';

export function atmosphereProbeShellPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'atmosphere-probe-shell',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      const bodyId = view.slab.frame.hostId;
      return (
        drawsAtmosphere(bodyId, ctx, state) && atmosphereEntry(bodyId, ctx, state)?.inside === false
      );
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodyId = view.slab.frame.hostId;
      const entry = atmosphereEntry(bodyId, ctx, state);
      if (entry === null) return;
      runtime.atmosphereShellRenderer.drawProbeShell(
        pass,
        entry.body.id,
        atmosphereShellUniforms(entry, view.slab, ctx, state),
        ctx.snapshot.renderTargets.farDepthView(),
        view.viewportPx,
      );
    },
  };
}
