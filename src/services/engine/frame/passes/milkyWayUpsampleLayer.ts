/**
 * milkyWayUpsampleLayer — composites the reduced-resolution `mw-aggregate`
 * offscreen (the Milky Way cloud's additive star field, drawn by
 * `milkyWayAggregateLayer`) back into HDR.
 *
 * The twin of `volumeUpsampleLayer` and `starAggregateUpsampleLayer`: a
 * linear-sampled fullscreen blit of an offscreen, additively blended into HDR.
 * Because the offscreen holds the additive SUM of every star billboard and the
 * composite is additive too, the result is mathematically what drawing the
 * billboards straight into HDR would have produced, up to bilinear
 * interpolation — and interpolating a low-frequency glow field is invisible.
 *
 * ### Why it reuses the shared additive-upsample factory
 *
 * `createAdditiveUpsample` is fully generic: a covering-triangle pipeline that
 * filters whatever view it is handed and adds it into an `rgba16float` target.
 * The cloud's aggregate offscreen meets its contract — additively summed, and
 * low-frequency enough that the 4-tap reconstruction costs nothing. This layer
 * draws through its OWN instance (`state.gpu.milkyWayAggregateUpsample`), not the
 * volume's, so the two subsystems share no handle and neither gate can affect
 * the other.
 *
 * ### Why not the star-aggregate upsample instead
 *
 * `starAggregateUpsample` re-applies the star pass's hue-preserving knee to the
 * summed field — photometry specific to the Gaia catalog's LOD symmetry, which
 * the procedural cloud's records do not participate in. A plain additive blit
 * is the correct composite here.
 *
 * ### Position in the HDR content order
 *
 * Immediately before `milkyWayLayer`'s dust pass, so the dust transmittance
 * multiplies the upsampled starlight as well as the cosmological accumulation
 * behind it — the same relationship the single-pass version had when stars and
 * dust shared one encoder (stars first, dust over them).
 *
 * ### Why `enabled` shares the cloud liveness projection
 *
 * The producer (`milkyWayAggregateLayer`) writes the offscreen this layer
 * consumes; both gate on the SAME `deriveMilkyWayCloudAlpha(...) !== null`, so
 * they can never disagree and this layer can never composite an offscreen
 * nobody wrote this frame. See `milkyWayCloudLiveness`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { deriveMilkyWayCloudAlpha } from '../milkyWayCloudLiveness';

export const milkyWayUpsampleLayer: ContentLayer = {
  name: 'milky-way-upsample',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    return deriveMilkyWayCloudAlpha(state, ctx) !== null;
  },

  // Like its two sibling upsamples, `draw` ignores the resolved SlabView — a
  // screen-space blit of an already-rendered offscreen has no view-projection
  // or viewport to thread through.
  draw(pass, _view, ctx, state) {
    // Defensive null-check, same pattern as the sibling upsample layers: the
    // gate proved liveness, but a future gate reordering can't silently skip it.
    if (state.gpu.milkyWayAggregateUpsample === null) return;
    state.gpu.milkyWayAggregateUpsample.draw(pass, ctx.renderTargets.viewOf('mw-aggregate'));
  },
};
