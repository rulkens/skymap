/**
 * labels3dLayer — dedicated draw site for the shared `label3DRenderer`
 * (world-geometry text: today the ZoA lettering + VR labels, see
 * `label3DProducers.ts`). Previously drawn only from
 * `zoneOfAvoidanceUpsampleLayer`'s `postBlit`, which gated the WHOLE
 * Label3D draw on ZoA band liveness (a camera-distance opacity) — so at
 * planet/solar-system scale, where the band is never live, no Label3D
 * producer's output ever reached the screen (this broke VR labels). This
 * layer instead gates on the renderer's own glyph count: each producer is
 * responsible for emitting nothing when it isn't live —
 * `produceZoneOfAvoidanceLettering` already self-gates on the same
 * liveness this layer used to depend on.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';

export const labels3dLayer: ContentLayer = {
  name: 'labels3d',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, _ctx) {
    const r = state.gpu.label3DRenderer;
    return r !== null && r.glyphCount() > 0;
  },

  draw(pass, view, _ctx, state) {
    state.gpu.label3DRenderer!.draw(pass, view.vp, view.viewportPx);
  },
};
