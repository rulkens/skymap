/**
 * focusedFieldStarSphereLayer — the close-range, true-scale sphere for the ONE
 * currently-focused Gaia field star (spec Amendment 2026-07-17, Stage 1.5).
 *
 * ### Why this layer exists
 *
 * Double-clicking a survey star frames the camera down to solar-radius
 * distance. At that range the only geometry the star has is its `starCatalog`
 * point sprite — so the descent bottoms out on a dot, not a body, and the
 * sprite additionally SWIMS: `vertex.wesl` reconstructs each star as
 * `originRelCam + offset·cellScale` in f32, whose two nearly-cancelling terms
 * carry AU-scale error within ~a couple of AU of the star. This layer builds
 * the missing surface: a real sphere for the focused star, composed on the f64
 * camera-relative scene-body path where that geometry is well-conditioned.
 *
 * ### Why option B (a thin sphere layer), NOT option A (a transient scene star)
 *
 * Appending the picked star to `visibleStars(state)` so
 * `partitionStarsByResolution` / `starSpheresLayer` pick it up "for free" reads
 * tidy but braids two independent things: it makes the authored SCENE-BODY star
 * set (a static seed table + one settings toggle) depend on RUNTIME SELECTION
 * state, and it drives the catalog star through the point-partition path it
 * does not need — the star ALREADY has a representation there (its `starCatalog`
 * sprite). Option A would then draw the picked star as a scene point AND a Gaia
 * sprite across the whole foreground range, widening the very sprite/sphere
 * overlap this amendment must resolve. Option B keeps the scene-body set pure
 * and scopes the new geometry to exactly the focused star at exactly close
 * range — growth at the "NEAR0 foreground sphere layer" seam, the same seam
 * Stage 1 grew for `near0SelectionRingLayer`. It reuses the RENDERER machinery
 * (`starRenderer`, `composeBodyMvp`, `RENDER_ORIGIN_MPC`, `SCALE_UNITS`,
 * `apparentSizePx`/`resolvesToSphere`) — not the SCENE-SET machinery
 * (`visibleStars`/`partitionStarsByResolution`), which is authored-body plumbing.
 *
 * ### Why the camera-to-STAR distance gate, NOT `ctx.cam.distance`
 *
 * `starSpheresLayer` gates on `ctx.cam.distance` — the camera's orbit distance
 * from the render origin — because its seeded stars sit AT or near the origin.
 * A picked FIELD star does not: it sits parsecs from the Sun, so its origin
 * distance is meaningless for deciding whether it resolves. What matters is the
 * star's own apparent sphere size, which depends on the CAMERA-TO-STAR distance
 * `|row.positionMpc − ctx.drawCamPos|`. Gating on that (via the shared
 * `apparentSizePx` + `resolvesToSphere` + `STAR_RESOLVE_PX` mechanism the two
 * `starSpheres`/`starPoints` layers use) turns the sphere on precisely as the
 * descent reaches resolving range, wherever in the sky the star lives.
 *
 * ### Why the f64 `composeBodyMvp` seam kills the wobble
 *
 * Like `earthLayer` and `starSpheresLayer`, this reads the slab's `Float64Array`
 * view-projection (`view.slab.vp`) rather than the f32-narrowed `view.vp`. A
 * sphere placed parsecs from the render origin sits where the VP's large
 * translation nearly cancels the tiny position; `composeBodyMvp` resolves that
 * cancellation in double precision BEFORE narrowing to f32, so the sphere lands
 * stable. The sprite's f32 reconstruction cannot — which is why the sprite is
 * retired from the near field in-shader (spec constraint 3) rather than hidden
 * behind this sphere. See `composeBodyMvp`'s module header for the full
 * compose-in-f64-then-narrow argument.
 *
 * ### Colour
 *
 * The sphere is tinted by `starTintFromBpRp(row.bpRp)` — the CPU evaluation of
 * the ONE canonical Gaia BP−RP ramp (`starCatalog/tint.wesl`), so the resolved
 * sphere lands the same colour as the point cloud it rose out of.
 *
 * `RENDER_ORIGIN_MPC` is imported directly (not threaded through ctx state) —
 * the render origin is fixed at the Sun for the zoom-to-earth fold.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { STAR_RESOLVE_PX } from '../partitionStarsByResolution';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { resolvesToSphere } from '../../../../utils/scene/resolvesToSphere';
import { starTintFromBpRp } from '../../../../utils/color/starTintFromBpRp';

/**
 * The focused-star sphere resolves iff the current `select` row is a `star`
 * whose solar-radius sphere clears `STAR_RESOLVE_PX` at the camera-to-star
 * distance. Returns the resolvedness given the camera position — shared by
 * `enabled` (reads `ctx.drawCamPos`, the absolute frame) and could be reused by
 * `draw` (which coincides because `RENDER_ORIGIN_MPC` is the origin).
 */
function starResolves(
  row: { positionMpc: Readonly<[number, number, number]>; radiusKm: number },
  camPosMpc: Readonly<[number, number, number]>,
  viewportHeightPx: number,
  fovYRad: number,
): boolean {
  const dx = row.positionMpc[0] - camPosMpc[0];
  const dy = row.positionMpc[1] - camPosMpc[1];
  const dz = row.positionMpc[2] - camPosMpc[2];
  const distanceMpc = Math.hypot(dx, dy, dz);
  // Physical diameter in kpc: radiusKm·2 → Mpc → kpc, every step through a
  // named SCALE_UNITS constant (mirrors partitionStarsByResolution).
  const diameterKpc = (row.radiusKm * 2 * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
  return resolvesToSphere({
    apparentSizePx: apparentSizePx({ diameterKpc, distanceMpc, viewportHeightPx, fovYRad }),
    thresholdPx: STAR_RESOLVE_PX,
    // Camera ON the star (distance 0) resolves unconditionally — the same
    // degenerate guard the partition keeps (apparentSizePx returns 0 there).
    alwaysResolved: distanceMpc <= 0,
  });
}

export const focusedFieldStarSphereLayer: ContentLayer = {
  name: 'focused-field-star-sphere',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx) {
    // Handle first (pre-bootstrap fixtures carry null handles + bare ctx), then
    // the row kind, then the camera-to-star resolve gate.
    if (state.gpu.starRenderer === null) return false;
    const row = state.selectionRows.select;
    if (row === null || row.type !== 'star') return false;
    return starResolves(row, ctx.drawCamPos, ctx.canvasSize.height, ctx.fovYRad);
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.starRenderer;
    if (renderer === null) return;
    const row = state.selectionRows.select;
    if (row === null || row.type !== 'star') return;

    // Compose from the slab's f64 vp — see the module header's f64 seam. Radius
    // is the stamped solar radius resolved into Mpc; no oblateness (a field
    // star carries no measured spin), so the default sphere compose applies.
    const mvp = composeBodyMvp(
      view.slab.vp,
      row.positionMpc,
      RENDER_ORIGIN_MPC,
      row.radiusKm * SCALE_UNITS.KM_TO_MPC,
    );
    renderer.draw(pass, mvp, starTintFromBpRp(row.bpRp));
  },
};
