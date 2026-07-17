/**
 * starPointsLayer — the point-partition stars (everything not resolved to a
 * sphere) as additive point sprites in the depthless HDR accumulation.
 *
 * ### What it draws
 *
 * The `points` branch of `partitionStarsByResolution` — every seeded star
 * whose apparent size stays below `STAR_RESOLVE_PX`, the Sun included (its
 * sphere is sub-pixel beyond ~tens of AU, and a point is what keeps it
 * visible from the rest of the neighbourhood). `starSpheresLayer` draws the
 * complementary `spheres` branch of the SAME partition call, so a star is a
 * point XOR a sphere by construction — see the partition module's docblock
 * for the structural-disjointness argument.
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
 * pre-bootstrap window), the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`), the backdrop-dissolve band
 * (`SCALE_FADE_BANDS.starBackdrop` > 0), AND a non-empty `points` branch —
 * the same partition `draw` consumes, so the enable gate and the uploaded
 * set cannot disagree. The backdrop is a minimum-size additive sprite field,
 * so at galaxy framing the whole roster collapses onto a few pixels into one
 * bright blob; the `starBackdrop` band dissolves it smoothly (its rgb scaled
 * per frame in `draw`) and completes STRICTLY inside the shared gate, so the
 * gate's hard cut lands on already-black sprites and never pops. Once the band
 * hits 0 the layer disables outright — the "opacity 0 ⇒ no render" house rule
 * — which also empties the `(hdr, NEAR0)` render step the executor then skips.
 * The handle check short-circuits first so pre-bootstrap fixtures (null
 * renderer, no bodies bag, bare ctx) never touch `state.data` or `ctx`; the
 * distance gate and the band run before the per-star partition so it is not
 * computed at all when the camera is far. `enabled` reads the camera from
 * `ctx.drawCamPos` (absolute frame) while `draw` reads `view.camPos`
 * (NEAR0's origin-relative frame); the two coincide because
 * `RENDER_ORIGIN_MPC` is the heliocentric origin [0,0,0].
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from '../partitionStarsByResolution';
import { visibleStars } from '../visibleStars';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';
import { starExposureRamp } from '../../../gpu/renderers/starCatalog/starExposureRamp';

export const starPointsLayer: ContentLayer = {
  name: 'star-points',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Handle first, distance second, backdrop-band third, partition last —
    // see the module header's gate note.
    if (state.gpu.starPointRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // Once the dissolve band has zeroed the backdrop, DISABLE the layer rather
    // than draw black sprites — the "opacity 0 ⇒ no render" house rule, which
    // also empties the (hdr, NEAR0) step so the executor skips it. Keyed on the
    // camera's distance from the heliocentric origin, the quantity the band
    // reads (drawCamPos is the absolute-frame eye; the origin is [0,0,0]).
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    if (fadeBand(SCALE_FADE_BANDS.starBackdrop, camDistMpc) <= 0) return false;
    return (
      partitionStarsByResolution({
        stars: visibleStars(state),
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
      stars: visibleStars(state),
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

    // The backdrop-dissolve alpha for THIS frame, keyed on the camera's distance
    // from the heliocentric origin — the same quantity `enabled` gates on, read
    // here from `view.camPos` (the frames coincide; see the module header). It
    // scales each star's uploaded colour below.
    const backdropFade = fadeBand(
      SCALE_FADE_BANDS.starBackdrop,
      Math.hypot(camPos[0], camPos[1], camPos[2]),
    );

    // Re-express each anchor as a small camera-relative vector, and premultiply
    // the colour by the dissolve alpha. The subtraction runs on the f64 seed
    // coordinates before the renderer narrows to f32; narrowing the raw ~1e-6
    // Mpc anchor would already have lost the low bits. Re-partitioned and
    // re-uploaded every frame — the point set is ≤25 stars, so the per-frame
    // buffer rebuild (and the colour scale riding it) is trivially cheap
    // (module header).
    //
    // Scaling the colour CPU-side is a COMPLETE fade, not an approximation: the
    // pipeline is one/one additive into the depthless HDR target, so each
    // fragment's rgb contribution scales linearly with the uploaded colour, and
    // the hdr→swap composite runs `blend: 'replace'` (`preserveAlpha 0`,
    // `compositor.ts` BLEND_TABLE), which discards the fragment's unscaled alpha
    // channel — so multiplying rgb here is the whole story.
    const rebasedPoints = points.map((star) => ({
      ...star,
      positionMpc: [
        star.positionMpc[0] - camPos[0],
        star.positionMpc[1] - camPos[1],
        star.positionMpc[2] - camPos[2],
      ] as Vec3,
      color: [
        star.color[0] * backdropFade,
        star.color[1] * backdropFade,
        star.color[2] * backdropFade,
      ] as Vec3,
    }));
    renderer.setStars(rebasedPoints);

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // anchors. Uses the slab's f64 `vp`, NOT the f32-narrowed `view.vp` —
    // narrowed HERE, at the GPU-upload boundary (`rebaseViewProj` stays f64
    // for consumers that must invert it).
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));

    // The same shared star appearance the survey (Gaia bin) leaf stage reads, so
    // a famous star obeys the identical sizePx slider and exposure model. NOT
    // gated on `starCatalogs.enabled` — that flag is the Gaia survey's master
    // toggle, and the famous layer has its own visibility gate. `brightness`
    // folds the SAME scale-dependent `starExposureRamp` `starCatalogLayer`
    // applies: the user trim times the camera-distance ramp, keyed on the
    // camera's heliocentric Mpc distance (the ramp's own input unit).
    const camDistMpc = Math.hypot(camPos[0], camPos[1], camPos[2]);
    const { sizePx, brightness: brightnessTrim } = state.settings.starCatalogs;
    const brightness =
      brightnessTrim *
      starExposureRamp(
        camDistMpc,
        state.settings.starCatalogs.exposureNearX,
        state.settings.starCatalogs.exposureMidX,
        state.settings.starCatalogs.exposureFarX,
      );
    renderer.draw(pass, rebasedVp, view.viewportPx, { sizePx, brightness });
  },
};
