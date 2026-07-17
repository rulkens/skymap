/**
 * starAggregateUpsampleLayer — the HDR content layer that composites the
 * half-resolution survey-star aggregate offscreen back into the HDR target,
 * re-applying the star pass's hue-preserving knee to the SUMMED aggregate
 * field.
 *
 * The twin of `volumeUpsampleLayer`: the aggregate raymarch analogue
 * (`starAggregatesLayer`) draws LINEAR into the `star-aggregates` offscreen in a
 * preceding render step; this layer reads it back with a linear sampler and
 * adds the knee'd result into HDR via the additive-blend pipeline baked into
 * `starAggregateUpsample`. Applying the knee to the summed field is what makes
 * an aggregate-covered region compress like a concentrated bright leaf does —
 * the LOD-symmetry fix (see the composite shader).
 *
 * Like `volumeUpsampleLayer`, `draw` ignores the resolved `SlabView` — the
 * composite is a screen-space blit of an already-rendered offscreen, not a
 * re-projection of world geometry.
 *
 * ### Position in the HDR NEAR0 group
 *
 * Registered immediately after `star-catalog` (the leaf draw) in the (hdr,
 * NEAR0) group, so the leaf dots and the composited aggregate glow sit adjacent
 * in the GPU-timing HUD. Order among these additive layers is commutative, so
 * the placement is for timing legibility, not compositing.
 *
 * ### Why `enabled` shares `starCatalogVisible`
 *
 * The producer (`starAggregatesLayer`) writes the offscreen this layer consumes;
 * both gate on the SAME `starCatalogVisible`, so a frame can never composite a
 * stale offscreen the aggregate render skipped clearing — the stale-offscreen
 * guard the volume liveness projection enforces, applied to the star pass. The
 * `starAggregateUpsample === null` bootstrap case is a `draw`-only defensive
 * concern (the handle is minted in `initGpu`), not an `enabled` gate.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { starCatalogVisible } from './starCatalogLayer';

export const starAggregateUpsampleLayer: ContentLayer = {
  name: 'star-upsample',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled: starCatalogVisible,

  draw(pass, _view, ctx, state) {
    // Defensive null-check — same pattern as volumeUpsampleLayer: the gate
    // proved the star pass is live, but null-checking here too means a future
    // gate reordering can't skip the guard. Costs one reference read.
    if (state.gpu.starAggregateUpsample === null) return;
    state.gpu.starAggregateUpsample.draw(pass, ctx.renderTargets.viewOf('star-aggregates'));
  },
};
