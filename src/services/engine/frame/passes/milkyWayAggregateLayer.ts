/**
 * milkyWayAggregateLayer — the Milky Way point cloud's ADDITIVE star pass,
 * drawn into the reduced-resolution `mw-aggregate` offscreen.
 *
 * The cloud stands in for ~1e11 stars with a budget in the hundreds of
 * thousands, so wherever the disc covers real screen area its sprites fall
 * below one per pixel and read as discrete particles rather than a galaxy.
 * The cure is more overlap per pixel (bigger, softer, fewer sprites), and the
 * wall that stops you is FILL, not instance count — measured, ~5x the
 * baseline sprite area collapses the frame rate while instance count drops.
 * A summed additive glow field is low-frequency, so rendering at `1/scale`
 * and bilinearly upsampling buys back the square of the divisor in fragment
 * cost — the same split the survey star pass makes (`starAggregatesLayer` →
 * `star-aggregates` → `starAggregateUpsampleLayer`); full rationale on the
 * `mw-aggregate` spec row in `renderTargets.ts`. The DUST pass stays in
 * `milkyWayLayer`, full-res in HDR, since its multiplicative transmittance
 * has to land on the real cosmological accumulation.
 *
 * Viewport is the DOWNSCALED size, not the canvas: `stars.wesl` clamps each
 * sprite's half-extent to `[starPxMin, starPxMax]` pixels OF THE TARGET BEING
 * RENDERED, so the canvas size would make every clamped sprite `scale` times
 * too big once upsampled — read via `ctx.renderTargets.sizeOf('mw-aggregate')`.
 *
 * Slab is NEAR0, not COSMO: COSMO's near plane is fixed at 10 kpc, but the
 * disc's near edge sits ~9.5 kpc out, so that plane would slice the cloud
 * mid-descent while the approach fade still shows it — see `milkyWayLayer`'s
 * header for the full note, including why NEAR0's adaptive far plane means
 * both shaders clamp clip-z.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { deriveMilkyWayCloudAlpha } from '../milkyWayCloudLiveness';
import { cameraBillboardBasis } from '../../../../utils/camera/cameraBillboardBasis';
import { milkyWayModelCached } from '../../galaxyGenerator/v1/milkyWayModelCached';

export const milkyWayAggregateLayer: ContentLayer = {
  name: 'milky-way-aggregate',
  slab: NEAR0,
  target: 'mw-aggregate',
  blend: 'additive',

  // Shared with the upsample consumer and the dust row — see
  // `milkyWayCloudLiveness` on why all three must answer identically.
  enabled(state, ctx) {
    return deriveMilkyWayCloudAlpha(state, ctx) !== null;
  },

  draw(pass, view, ctx, state) {
    // Defensive re-derivation, mirroring `scalarVolumeLayer`: `enabled` already
    // proved liveness, but re-deriving keeps this a pure function of
    // (state, ctx) with no reliance on gate ordering.
    const fadeAlpha = deriveMilkyWayCloudAlpha(state, ctx);
    if (fadeAlpha === null) return;
    // The cloud buffers and renderer live on `state.gpu` (nullable, like every
    // GPU handle) and `enabled` doesn't narrow them; the pre-bootstrap window is
    // the only case these fire.
    const cloud = state.gpu.milkyWayCloud;
    if (cloud === null) return;
    const cloudRenderer = state.gpu.milkyWayCloudRenderer;
    if (cloudRenderer === null) return;

    // Viewport is the mw-aggregate target's allocated size (see `sizeOf`) —
    // see the module header on why the px sprite clamp makes this
    // load-bearing rather than cosmetic.
    const { width: vw, height: vh } = ctx.renderTargets.sizeOf('mw-aggregate');

    const { right: camRight, up: camUp } = cameraBillboardBasis(ctx.cam);

    cloudRenderer.drawStars(pass, {
      vp: view.vp,
      viewportPx: [vw, vh],
      camRight,
      camUp,
      model: milkyWayModelCached(),
      fadeAlpha,
      // The live look knobs — `MilkyWaySettings` widens to `MilkyWayTuning`,
      // so the cluster passes straight through. Read here rather than in the
      // renderer so a DebugPanel slider drag lands on the next frame with no
      // imperative setter in between.
      tuning: state.settings.milkyWay,
      buffers: cloud.buffers(),
    });
  },
};
