/**
 * milkyWayAggregateLayer — the Milky Way point cloud's ADDITIVE star pass,
 * drawn into the reduced-resolution `mw-aggregate` offscreen.
 *
 * ### Why the star pass left the HDR target
 *
 * The cloud stands in for ~1e11 stars with a budget in the hundreds of
 * thousands, so wherever the disc covers real screen area its sprites fall
 * below one per pixel and the field reads as discrete particles rather than as
 * a galaxy. The cure is more overlap per pixel — bigger, softer, fewer sprites
 * — and the wall that stops you is FILL, not instance count: measured, ~5x the
 * baseline sprite area collapses the frame rate while the instance count is
 * going down.
 *
 * A summed additive glow field is low-frequency, so it can be rendered at
 * `1/scale` and bilinearly upsampled for free while its fragment cost drops by
 * the square of the divisor. That is exactly the split the survey star pass
 * already makes (`starAggregatesLayer` → `star-aggregates` →
 * `starAggregateUpsampleLayer`), for exactly the same reason, and this row is
 * its Milky-Way twin. The full rationale lives on the `mw-aggregate` spec row
 * in `renderTargets.ts`.
 *
 * The DUST pass stays in `milkyWayLayer`, full-res in HDR: its multiplicative
 * transmittance has to land on the real cosmological accumulation, and it is
 * not the fill-bound half.
 *
 * ### Why the downscaled viewport (not the canvas viewport)
 *
 * `stars.wesl` clamps each sprite's on-screen half-extent to
 * `[starPxMin, starPxMax]` PIXELS, converting from NDC via the uniform's
 * `viewportPx`. Those are pixels OF THE TARGET BEING RENDERED. Handing it the
 * canvas size while drawing into a downscaled target would make every clamped
 * sprite come out `scale` times its intended size once upsampled. So the viewport is
 * computed from the same `floor(canvas / scale)`, min-1-px formula
 * `renderTargets` allocates with, reading the SAME `scale` off the
 * `'mw-aggregate'` spec row — the identical discipline `scalarVolumeLayer`
 * follows for its dither frequency.
 *
 * ### Why NEAR0
 *
 * Same reason `milkyWayLayer` uses it: COSMO's near plane is fixed at 10 kpc,
 * but the disc's near edge sits ~9.5 kpc from the heliocentric origin, so that
 * plane slices through the cloud mid-descent while the approach fade still
 * shows it. See `milkyWayLayer`'s header for the full note, including why
 * NEAR0's ADAPTIVE far plane is why both shaders clamp clip-z.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { deriveMilkyWayCloudAlpha } from '../milkyWayCloudLiveness';
import { cameraBillboardBasis } from '../../../../utils/camera/cameraBillboardBasis';
import { milkyWayModelCached } from '../../../gpu/galaxy/milkyWayModelCached';

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

    // Viewport matches the mw-aggregate target's texture size — see the module
    // header on why the px sprite clamp makes this load-bearing rather than
    // cosmetic. Reading the divisor off the spec row keeps it single-homed.
    const scale = ctx.renderTargets.specs.find((s) => s.id === 'mw-aggregate')!.scale;
    const vw = Math.max(1, Math.floor(ctx.canvasSize.width / scale));
    const vh = Math.max(1, Math.floor(ctx.canvasSize.height / scale));

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
