/**
 * starSpheresLayer — the resolved-partition stars as true-scale,
 * flat-emissive spheres in the depth-bearing `foreground:0` target.
 *
 * ### What it draws
 *
 * The `spheres` branch of `partitionStarsByResolution` — every seeded star
 * whose apparent size clears `STAR_RESOLVE_PX` (the Sun included: below the
 * threshold it demotes to an additive point like any other star, so it
 * never vanishes) — each composed as a unit sphere scaled to the body's
 * equatorial radius (`radiusM` → Mpc via `SCALE_UNITS.M_TO_MPC`) and
 * translated to its `positionMpc` in the `RENDER_ORIGIN_MPC`-relative frame,
 * tinted by its blackbody colour — derived from its `temperatureK` via
 * `temperatureToLinearRgb`. A star's optional `oblateness` flattens
 * the polar (model-Z) axis via `composeBodyMvp` — the sphere is the
 * `oblateness` absent (⇒ 0) case. `starPointsLayer` draws the complementary
 * `points` branch of the SAME partition call, so a star is a sphere XOR a
 * point by construction — see the partition module's docblock for the
 * structural-disjointness argument.
 *
 * ### Renderer uniform caveat (known gap)
 *
 * `starRenderer.draw` writes MVP+colour into a single non-dynamic uniform
 * buffer, so a camera pose that resolves TWO stars at once yields two
 * sphere draws whose `queue.writeBuffer` calls both land before the frame's
 * submit — both draws read the LAST uniform. Since the size gate now
 * demotes every distant star (a second simultaneously-resolved star needs
 * the camera within ~AU of two stars at once), the case is out of reach in
 * the seeded scene, but the real fix is a dynamic-offset or per-instance
 * uniform upgrade in the renderer.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Like `earthLayer`, this is a near-field sphere body that reads the slab's
 * `Float64Array` view-projection (`view.slab.vp`) rather than the
 * f32-narrowed `view.vp` every cosmological layer consumes. A sphere placed
 * parsecs (or, for the Sun, zero) from the render origin sits where the VP's
 * large translation nearly cancels the tiny position — `composeBodyMvp` must
 * resolve that cancellation in double precision BEFORE narrowing to f32, or
 * the body lands off by more than its own radius. See `composeBodyMvp`'s
 * module header for the full compose-in-f64-then-narrow argument.
 *
 * ### When it draws
 *
 * `enabled` gates on the `starRenderer` GPU handle (null in the
 * pre-bootstrap window), the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC` — beyond it every seeded star is a
 * deep-sub-pixel speck, and gating with the NEAR0 siblings lets the executor
 * skip the whole foreground pass group as empty), AND a non-empty `spheres`
 * branch — the same partition `draw` consumes, so the enable gate and the
 * draw set cannot disagree. The handle check short-circuits first so
 * pre-bootstrap fixtures (null renderer, no bodies bag, bare ctx) never
 * touch `state.data` or `ctx`; the distance gate runs second so the
 * per-star partition is not computed at all when the camera is far.
 * `enabled` reads the camera from `ctx.drawCamPos` (absolute frame) while
 * `draw` reads `view.camPos` (NEAR0's origin-relative frame); the two
 * coincide because `RENDER_ORIGIN_MPC` is the heliocentric origin [0,0,0].
 *
 * `RENDER_ORIGIN_MPC` is imported directly as a constant (not threaded
 * through ctx state) — the render origin is fixed at the Sun for the
 * zoom-to-earth fold.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { IDENTITY_MAT3 } from '../../../../utils/math/identityMat3';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from '../partitionStarsByResolution';
import { positionedVisibleStars } from '../positionedVisibleStars';
import { starPickId } from './starPickId';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { drawFlooredSpherePick } from '../../helpers/drawFlooredSpherePick';

export const starSpheresLayer: ContentLayer = {
  name: 'star-spheres',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx, _view) {
    // Handle first, distance second, partition last — see the module
    // header's gate note.
    if (state.gpu.starRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    return (
      partitionStarsByResolution({
        stars: positionedVisibleStars(state, ctx),
        camPosMpc: ctx.drawCamPos,
        thresholdPx: STAR_RESOLVE_PX,
        viewportHeightPx: ctx.canvasSize.height,
        fovYRad: ctx.fovYRad,
      }).spheres.length > 0
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starRenderer;
    if (renderer === null) return;

    const { spheres } = partitionStarsByResolution({
      stars: positionedVisibleStars(state, ctx),
      camPosMpc: view.camPos,
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: view.viewportPx[1],
      fovYRad: ctx.fovYRad,
    });

    // Compose each resolved star's MVP from the slab's f64 vp — see the
    // module header's "f64 seam" note for why `view.slab.vp`, not `view.vp`.
    // Radius is the authored metres resolved into Mpc at the draw site. A
    // star is a flat-emissive sphere — rotation-invariant — so it carries the
    // identity orientation rather than a baked facing; `oblateness` (absent ⇒
    // 0 ⇒ sphere) flattens the polar axis in the compose.
    for (const star of spheres) {
      const mvp = composeBodyMvp(
        view.slab.vp,
        star.positionMpc,
        RENDER_ORIGIN_MPC,
        star.radiusM * SCALE_UNITS.M_TO_MPC,
        IDENTITY_MAT3,
        star.oblateness,
      );
      // Narrow here, at the GPU draw call — composeBodyMvp returns f64.
      renderer.draw(pass, narrowMat4(mvp), star.color);
    }
  },

  // Pick aspect — stamps one packed identity per RESOLVED scene-star sphere into
  // the NEAR0 r32uint pick pass, one `drawSphere` per body (each with its own
  // MVP + packed id, so the sphere picks never collapse onto the last star — the
  // writeBuffer-vs-submit race `bodyPickRenderer` guards with per-draw dynamic
  // offsets). The resolved set is the SAME `partitionStarsByResolution` call
  // `draw` runs — `positionedVisibleStars` split at `STAR_RESOLVE_PX` against
  // `view.camPos` and `view.viewportPx[1]` — so a star is pickable-as-a-sphere
  // exactly when it draws as a sphere (its complement rides `starPointsLayer`'s
  // point pick), never both and never neither.
  //
  // The packed id carries each star's STABLE seed-table index, NOT its slot in
  // the sphere partition (which shifts as a star crosses `STAR_RESOLVE_PX` —
  // see `seedIndexOfBody`). `starPickId` picks the table and drops an id in
  // neither: a packed id from −1 would alias body 0. The MVP folds
  // `oblateness` the same way `draw` does, so the pick silhouette matches.
  //
  // This row self-binds its own @group(0) pick camera inside `drawSphere` (the
  // sphere pick's per-draw uniform); on NEAR0 there is no shared point-pick
  // prefix to inherit or restore — that contract is a COSMO-pass fact.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null) return;

    const { spheres } = partitionStarsByResolution({
      stars: positionedVisibleStars(state, ctx),
      camPosMpc: view.camPos,
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: view.viewportPx[1],
      fovYRad: ctx.fovYRad,
    });

    for (const star of spheres) {
      const packedId = starPickId(star.id);
      if (packedId === null) continue; // in neither seed table — see starPickId.
      // Floor the PICK radius to the shared min footprint (visual sphere
      // untouched) via the shared `drawFlooredSpherePick` recipe: a just-resolved
      // star near STAR_RESOLVE_PX is only a few pixels across. A resolved star is
      // a rotation-invariant emissive sphere (IDENTITY_MAT3) that carries its
      // measured `oblateness`; its identity is the stable seed-table index.
      drawFlooredSpherePick(pickRenderer, pass, {
        vp: view.slab.vp,
        positionMpc: star.positionMpc,
        radiusMpc: star.radiusM * SCALE_UNITS.M_TO_MPC,
        camPosMpc: view.camPos,
        drawPxPerRad: ctx.drawPxPerRad,
        orientation: IDENTITY_MAT3,
        oblateness: star.oblateness,
        packedId,
      });
    }
  },
};
