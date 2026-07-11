/**
 * starPointsLayer — the point-partition stars (everything not resolved to a
 * sphere) as additive point sprites in the depthless HDR accumulation.
 *
 * ### What it draws
 *
 * The `points` branch of `partitionStarsByResolution` — every seeded star
 * whose apparent size stays below `STAR_RESOLVE_PX` (the alwaysResolved Sun
 * never appears here). `starSpheresLayer` draws the complementary `spheres`
 * branch of the SAME partition call, so a star is a point XOR a sphere by
 * construction — see the partition module's docblock for the
 * structural-disjointness argument.
 *
 * ### The odd row out: `hdr` target, NEAR0 slab
 *
 * Every other hdr layer projects through the COSMO slab, but COSMO's near
 * plane (0.01 Mpc) would clip the parsec-scale star anchors, so this row
 * projects through NEAR0 — whose near/far track the camera's orbit
 * distance — while still accumulating into the HDR target so the stars ride
 * the same tone-map as the galaxies. The frame program carries a dedicated
 * `(hdr, NEAR0)` render step for it, placed after the `(hdr, COSMO)` step
 * and before the hdr→swap composite.
 *
 * ### Why the f64 seam — the point anchors need double precision too
 *
 * The vertex stage projects each star as `clip = viewProj · vec4(pos, 1)` in
 * f32. During the final approach to a local-map star the anchor (a parsec-scale
 * coordinate, ~1.3×10⁻⁶ Mpc) AND the NEAR0 vp's view translation are BOTH
 * ~1.3×10⁻⁶ Mpc from the render origin — the camera sits within tens of AU of a
 * star that is itself parsecs from the Sun. Their f32 subtraction cancels to ~4
 * digits, quantising the camera-relative anchor onto a ~0.04 AU grid, so the
 * point sprite visibly jitters as the camera closes from tens of AU down to the
 * sphere handoff — worse the nearer it gets. The precision killer is each term's
 * distance FROM THE ORIGIN, not the star's angular size: a sprite that subtends
 * under a pixel still has its projected CENTRE hop by several pixels. Consuming
 * the f32-narrowed `view.vp` — whose translation bits are already gone — cannot
 * fix this.
 *
 * The fix mirrors `foregroundLabelsLayer`'s caption seam exactly. Each frame we
 * rebase both operands into a camera-relative frame in f64 before narrowing:
 * `rebaseViewProj(view.slab.vp, camPos)` folds the eye offset into the vp
 * (zeroing the large view translation) and each anchor is re-expressed as
 * `pos − camPos` (a small camera-relative vector). Neither operand the f32
 * shader multiplies carries a large-number-cancellation hazard, and the shader
 * and renderer pipeline are untouched — only what this layer HANDS them changes.
 *
 * ### Per-frame upload, not upload-on-change
 *
 * Rebasing makes every anchor camera-relative, so the uploaded positions move
 * every frame the camera does — a membership fingerprint can no longer gate the
 * upload. `draw` therefore re-partitions and `setStars` the point subset every
 * frame. That rebuilds the GPU instance buffer per frame, but the point set is
 * ≤25 seeded stars (anything close enough to resolve becomes a sphere via
 * `starSpheresLayer`), so the create/destroy is trivially cheap — the churn the
 * old fingerprint cache guarded against does not exist at this scale.
 *
 * ### When it draws
 *
 * `enabled` gates on the `starPointRenderer` GPU handle (null in the
 * pre-bootstrap window) AND a non-empty `points` branch — the same
 * partition `draw` consumes, so the enable gate and the uploaded set
 * cannot disagree. The handle check short-circuits first so pre-bootstrap
 * fixtures (null renderer, no bodies bag, bare ctx) never touch
 * `state.data` or `ctx`. `enabled` reads the camera from `ctx.drawCamPos`
 * (absolute frame) while `draw` reads `view.camPos` (NEAR0's
 * origin-relative frame); the two coincide because `RENDER_ORIGIN_MPC` is
 * the heliocentric origin [0,0,0].
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from '../partitionStarsByResolution';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';

export const starPointsLayer: ContentLayer = {
  name: 'star-points',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Handle first, partition second — see the module header's gate note.
    if (state.gpu.starPointRenderer === null) return false;
    return (
      partitionStarsByResolution({
        stars: state.data.bodies.stars,
        camPosMpc: ctx.drawCamPos,
        thresholdPx: STAR_RESOLVE_PX,
        viewportHeightPx: ctx.canvasSize.height,
        fovYRad: ctx.fovYRad,
      }).points.length > 0
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starPointRenderer;
    if (renderer === null) return;

    const { points } = partitionStarsByResolution({
      stars: state.data.bodies.stars,
      camPosMpc: view.camPos,
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: view.viewportPx[1],
      fovYRad: ctx.fovYRad,
    });

    // Rebase into the camera-relative frame in f64 so the f32 upload carries no
    // catastrophic cancellation — see the module header's f64-seam note.
    // `view.camPos` is the origin-relative eye (the same frame `view.slab.vp`
    // and the star anchors are built in), so subtracting it here zeroes the
    // view translation `rebaseViewProj` folds into the vp.
    const camPos = view.camPos;

    // Re-express each anchor as a small camera-relative vector. The subtraction
    // runs on the f64 seed coordinates before the renderer narrows to f32;
    // narrowing the raw ~1e-6 Mpc anchor would already have lost the low bits.
    // Re-partitioned and re-uploaded every frame — the point set is ≤25 stars,
    // so the per-frame buffer rebuild is trivially cheap (module header).
    const rebasedPoints = points.map((star) => ({
      ...star,
      positionMpc: [
        star.positionMpc[0] - camPos[0],
        star.positionMpc[1] - camPos[1],
        star.positionMpc[2] - camPos[2],
      ] as Vec3,
    }));
    renderer.setStars(rebasedPoints);

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // anchors. Uses the slab's f64 `vp`, NOT the f32-narrowed `view.vp`.
    const rebasedVp = rebaseViewProj(view.slab.vp, camPos);
    renderer.draw(pass, rebasedVp, view.viewportPx);
  },
};
