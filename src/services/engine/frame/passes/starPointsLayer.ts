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
 * the seeded roster (119 famous stars incl. the Sun, plus 39 S-stars) minus whichever few
 * resolve to a sphere via `starSpheresLayer`, so the create/destroy is
 * trivially cheap — the churn the old fingerprint cache guarded against does
 * not exist at this scale.
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
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { BodyRegionId } from '../../../../@types/data/BodyRegionId';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { BodyPointPick } from '../../../../@types/rendering/BodyPickRenderer';
import { NEAR0 } from '../slabs';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from '../partitionStarsByResolution';
import { positionedVisibleStars } from '../positionedVisibleStars';
import { sceneBodyStates } from '../sceneBodyStates';
import { starPickId } from './starPickId';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { regionRelativeDistanceMpc } from '../../../../utils/scene/regionRelativeDistanceMpc';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';
import { sgrAStarCaptionTarget } from '../../presentation/sgrAStarCaptionTarget';
import { starExposureRamp } from '../../../gpu/renderers/starCatalog/starExposureRamp';
import { SGR_A_STAR } from '../../../../data/bodies/sceneSgrAStar';
import { Source } from '../../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { FAMOUS_STAR_PICK_RADIUS_PX } from '../../../../data/famousStarPickRadiusPx';
import { regionById } from '../../../../utils/scene/regionById';
import { regionOfBody } from '../../../../utils/scene/regionOfBody';
import { projectToScreenPx } from '../../../../utils/camera/projectToScreenPx';

// The scale regime the star backdrop belongs to. Its anchor — not the render
// origin — is what the dissolve band measures the camera against, so the band
// keeps meaning the moment a star map is seeded somewhere other than the Sun.
const STAR_BACKDROP_REGION = regionById('solar-neighbourhood');

/** The anchor's own regime — the satellites its pick footprint may claim. */
const GALACTIC_CENTRE_REGION_ID: BodyRegionId = 'galactic-centre';

/**
 * The one fact "the Galactic Centre's caption invites a click" — the whole of
 * what makes the anchor clickable, since it draws NOTHING at any zoom.
 * `pickEnabled` (admit this layer on a frame with no star points) and `drawPick`
 * (emit the stamp) must AGREE on it, so it is spelled once here — the same
 * discipline `bodyGlintsLayer`'s `earthCaptionPickable` keeps for Earth.
 *
 * `sgrAStarCaptionTarget` IS the caption's own fade target, off the same rules
 * row `foregroundLabelsLayer` indexes, so pick follows the visible AFFORDANCE by
 * construction rather than by two gates kept in step. With the label off there
 * is no mark at all, and an invisible 18 px target in empty sky would be a trap.
 * The shared foreground gate rides alongside it: past that the whole NEAR0 group
 * is skipped, so a stamp there could never be rasterised anyway.
 */
function sgrAStarCaptionPickable(state: EngineState, ctx: ReadyFrameContext): boolean {
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
  return sgrAStarCaptionTarget(state.settings, ctx.drawCamPos, ctx.cam.distance) > 0;
}

export const starPointsLayer: ContentLayer = {
  name: 'star-points',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx, _view) {
    // Handle first, distance second, backdrop-band third, partition last —
    // see the module header's gate note.
    if (state.gpu.starPointRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // Once the dissolve band has zeroed the backdrop, DISABLE the layer rather
    // than draw black sprites — the "opacity 0 ⇒ no render" house rule, which
    // also empties the (hdr, NEAR0) step so the executor skips it. Keyed on the
    // camera's distance from the star map's own region anchor — the Sun, at
    // [0,0,0], so this is today the same number as the raw origin distance
    // (drawCamPos is the absolute-frame eye).
    const regionDistMpc = regionRelativeDistanceMpc(
      ctx.drawCamPos,
      STAR_BACKDROP_REGION,
      sceneBodyStates(state, ctx),
    );
    if (fadeBand(SCALE_FADE_BANDS.starBackdrop, regionDistMpc) <= 0) return false;
    return (
      partitionStarsByResolution({
        stars: positionedVisibleStars(state, ctx),
        camPosMpc: ctx.drawCamPos,
        thresholdPx: STAR_RESOLVE_PX,
        viewportHeightPx: ctx.canvasSize.height,
        fovYRad: ctx.fovYRad,
      }).points.length > 0
    );
  },

  // Pick gate — WIDER than `enabled`: this layer also carries Sgr A*'s pick
  // stamp (see `drawPick`), which hangs off the caption rather than the star
  // partition. Deep in the Galactic Centre with the famous-star map muted the
  // partition can be empty while the name is still on screen, and `enabled`
  // stays partition-only so no zero-star row enters the VISUAL pass plan.
  // Composed over `enabled` rather than restating its gates. The handle guard
  // is `drawPick`'s, checked first so a pre-bootstrap frame never reaches the
  // body-state snapshot. See `ContentLayer.pickEnabled`.
  pickEnabled(state, ctx, view) {
    if (state.gpu.bodyPickRenderer === null) return false;
    if (starPointsLayer.enabled(state, ctx, view)) return true;
    return sgrAStarCaptionPickable(state, ctx);
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starPointRenderer;
    if (renderer === null) return;

    const { points } = partitionStarsByResolution({
      stars: positionedVisibleStars(state, ctx),
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
    // from the star map's region anchor — the same quantity `enabled` gates on,
    // read here from `view.camPos` (the frames coincide; see the module header).
    // It scales each star's uploaded colour below.
    const backdropFade = fadeBand(
      SCALE_FADE_BANDS.starBackdrop,
      regionRelativeDistanceMpc(camPos, STAR_BACKDROP_REGION, sceneBodyStates(state, ctx)),
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
    // a famous star obeys the identical sizePx slider and exposure model. These
    // are the cluster's APPEARANCE knobs, read unconditionally — the cluster's
    // visibility gate is applied upstream, where `visibleStars` composes
    // `starCatalogs.enabled` with the famous-star row's own bit. `brightness`
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

  // Pick aspect — stamps the POINT-partition scene stars into the NEAR0 r32uint
  // pick pass as ONE instanced pick-billboard draw (each expanded to a generous
  // clickable 18 px footprint by `bodyPickRenderer` — these labelled scene stars
  // are click-invited targets), so a sub-pixel star stays easily pickable at its
  // true screen position. The point set is the SAME
  // `partitionStarsByResolution` call `draw` runs — `positionedVisibleStars`
  // split at `STAR_RESOLVE_PX` against `view.camPos`/`view.viewportPx[1]` — so a star
  // is pickable-as-a-point exactly when it draws as one (its complement rides
  // `starSpheresLayer`'s sphere pick).
  //
  // `bodyPickRenderer.drawPoints` is safe to call once per caller per pass — each
  // caller claims its own per-pass slot of buffers, so this layer's call and the
  // body-glint layer's call in the same pick pass write DIFFERENT buffers and
  // neither races `writeBuffer` against submit. This layer calls it exactly once
  // per `drawPick`.
  //
  // Each point's packed id carries its STABLE seed-table index, NOT its slot in
  // the point partition (which shifts as a star crosses `STAR_RESOLVE_PX` — see
  // `seedIndexOfBody`); `starPickId` picks the table and drops an id in neither
  // (a packed id from −1 would alias body 0). Anchors are rebased
  // into the camera-relative frame in f64 before narrowing, the SAME seam
  // `draw` uses — the backdrop-dissolve colour scale is a visual-only concern
  // the pick omits (pick has no opacity; the `enabled` gate already drops the
  // whole layer once the band zeroes).
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null) return;

    const { points } = partitionStarsByResolution({
      stars: positionedVisibleStars(state, ctx),
      camPosMpc: view.camPos,
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: view.viewportPx[1],
      fovYRad: ctx.fovYRad,
    });

    const camPos = view.camPos;
    const pickPoints: BodyPointPick[] = [];
    const relToCam = (positionMpc: Readonly<Vec3>): Vec3 => [
      positionMpc[0] - camPos[0],
      positionMpc[1] - camPos[1],
      positionMpc[2] - camPos[2],
    ];

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // anchors — narrowed at the GPU-upload boundary, exactly as `draw` does.
    // Hoisted above the pack loop because the satellite test below projects
    // through it.
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));

    // The Galactic Centre's stamp — the ONLY thing that makes the anchor
    // clickable. It draws nothing at any zoom (invisible by design), so unlike
    // every other id in this list there is no sprite whose footprint the pick
    // widens; the caption IS the target, and `sgrAStarCaptionPickable` above is
    // the whole gate. Emitted here rather than in a row of its own because this
    // is the layer already live at the Galactic Centre, stamping the S-stars
    // that orbit it, and `bodyPickRenderer.drawPoints` takes one array per
    // caller per pass — so the anchor rides its satellites' single draw.
    let anchorScreenPx: Vec2 | null = null;
    if (sgrAStarCaptionPickable(state, ctx)) {
      const anchorPos = sceneBodyStates(state, ctx).get(SGR_A_STAR.id)!.positionMpc;
      const anchorRel = relToCam(anchorPos);
      anchorScreenPx = projectToScreenPx(anchorRel, rebasedVp, view.viewportPx);
      pickPoints.push({
        posRelCamMpc: anchorRel,
        packedId: packSelection(Source.SgrAStar, 0 + PICK_SENTINEL_OFFSET),
      });
    }

    for (const star of points) {
      const packedId = starPickId(star.id);
      if (packedId === null) continue; // in neither seed table — see starPickId.
      const posRelCamMpc = relToCam(star.positionMpc);
      // A satellite inside its own anchor's click target is not separately
      // aimable, so it must not take the anchor's click. Zoomed out, all 39
      // S-star orbits collapse well inside the anchor's 18 px footprint and one
      // of them would win the centre pixel on true depth — the black hole is
      // unclickable exactly where it is the only thing you could mean. Zoomed
      // in, each orbit clears the footprint and its star becomes aimable again,
      // outermost first, so the handoff needs no threshold of its own.
      //
      // Scoped to the anchor's OWN region rather than to every overlapping
      // point: a famous star that merely lines up with Sagittarius from Earth is
      // a different object at a different distance and keeps its click.
      if (anchorScreenPx !== null && regionOfBody(star.id)?.id === GALACTIC_CENTRE_REGION_ID) {
        const screenPx = projectToScreenPx(posRelCamMpc, rebasedVp, view.viewportPx);
        if (
          screenPx !== null &&
          Math.hypot(screenPx[0] - anchorScreenPx[0], screenPx[1] - anchorScreenPx[1]) <
            FAMOUS_STAR_PICK_RADIUS_PX
        ) {
          continue;
        }
      }
      pickPoints.push({ posRelCamMpc, packedId });
    }

    pickRenderer.drawPoints(pass, {
      vp: rebasedVp,
      viewportPx: view.viewportPx,
      points: pickPoints,
    });
  },
};
