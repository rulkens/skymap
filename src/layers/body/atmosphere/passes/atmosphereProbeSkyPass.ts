/**
 * atmosphereProbeSkyPass — the sky a mesh probe is captured under, so a mesh standing in
 * an atmosphere (the Søndermarken scan) is lit by the sky's colour on its shaded side.
 * Drawn only from the probe capture's roster, ahead of the ground passes that overdraw it;
 * `atmosphere-shell` cannot serve a face (it classifies rays by a sampled depth a capture
 * never resolves). The sky-view LUT is the main view's: a probe eye far from the camera's
 * altitude reads a sky baked for another height. Probe faces are not rig views, so a host
 * no rig view draws (`atmosphereRosterPlanner`) is not re-baked: its probe reads the last bake.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { atmosphereEntry } from '../present/atmosphereEntry';
import { drawsAtmosphere } from '../present/drawsAtmosphere';
import { atmosphereShellUniforms } from '../present/atmosphereShellUniforms';

export function atmosphereProbeSkyPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'atmosphere-probe-sky',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      const bodyId = view.slab.frame.hostId;
      return (
        drawsAtmosphere(bodyId, ctx, state) && atmosphereEntry(bodyId, ctx, state)?.inside === true
      );
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodyId = view.slab.frame.hostId;
      const entry = atmosphereEntry(bodyId, ctx, state);
      if (entry === null) return;
      runtime.atmosphereShellRenderer.drawProbeSky(
        pass,
        entry.body.id,
        atmosphereShellUniforms(entry, view.slab, ctx, state),
        ctx.snapshot.renderTargets.farDepthView(),
      );
    },
  };
}
