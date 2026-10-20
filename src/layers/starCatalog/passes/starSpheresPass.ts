/**
 * starSpheresPass — the resolved seeded stars as true-scale, flat-emissive
 * spheres in the depth-bearing `foreground:0` target.
 *
 * ### What it draws
 *
 * The seeded stars (found by `SEEDED_STAR_REFS`) in the `resolved` branch of
 * core's one scene-body sort — every admitted star whose apparent size clears
 * its `resolvePx` (the Sun included: below it the star demotes to an additive
 * point like any other, so it never vanishes) — each composed as a unit sphere scaled to the body's
 * equatorial radius (`surface.datumRadiusM` → Mpc via `SCALE_UNITS.M_TO_MPC`) and
 * translated to its `positionMpc` in the `RENDER_ORIGIN_MPC`-relative frame,
 * tinted by its blackbody colour — derived from its `temperatureK` via
 * `temperatureToLinearRgb`. A star's optional `oblateness` flattens
 * the polar (model-Z) axis via `composeBodyMvp` — the sphere is the
 * `oblateness` absent (⇒ 0) case. `starPointsPass` draws the stars of the
 * complementary `unresolved` branch of the SAME sort, so a star is a sphere XOR
 * a point by construction.
 *
 * ### Renderer uniform caveat (known gap)
 *
 * `starRenderer.draw` writes MVP, colour and opacity into a single non-dynamic uniform
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
 * Like `earthPass`, this is a near-field sphere body that reads the slab's
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
 * `enabled` gates on the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC` — beyond it every seeded star is a
 * deep-sub-pixel speck, and gating with the NEAR0 siblings lets the executor
 * skip the whole foreground pass group as empty), AND a resolved seeded star —
 * the same sort `draw` consumes, so the enable gate and the draw set cannot
 * disagree. The distance gate runs first so the sort is not run at all when the
 * camera is far. The sort is bound at `ctx.drawCamPos` (absolute frame) while the
 * MVPs compose at `view.camPos` (NEAR0's origin-relative frame); the two coincide
 * because `RENDER_ORIGIN_MPC` is the heliocentric origin [0,0,0].
 *
 * `RENDER_ORIGIN_MPC` is imported directly as a constant (not threaded
 * through ctx state) — the render origin is fixed at the Sun for the
 * zoom-to-earth fold.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { composeBodyMvp } from '../../../utils/camera/composeBodyMvp';
import { IDENTITY_MAT3 } from '../../../utils/math/identityMat3';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { sceneBodyPresentation } from '../../../services/engine/frame/sceneBodyPresentation';
import { positionedSeededStars } from '../present/positionedSeededStars';
import { SEEDED_STAR_REFS } from '../present/seededStarRefs';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../data/rendering/foregroundMaxDistance';
import { drawFlooredSpherePick } from '../../../services/engine/helpers/drawFlooredSpherePick';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';

export function starSpheresPass(runtime: StarCatalogRuntime): ContentPass<'starCatalog'> {
  return {
    name: 'star-spheres',
    fade: 'starCatalog',

    enabled(_state, ctx, _view) {
      // Distance first, sort last — see the module header's gate note.
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      return sceneBodyPresentation(ctx).resolved.some(({ body }) => SEEDED_STAR_REFS.has(body.id));
    },

    draw(pass, view, ctx, _state, fade) {
      const spheres = positionedSeededStars(sceneBodyPresentation(ctx).resolved);

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
          star.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC,
          IDENTITY_MAT3,
          star.oblateness,
        );
        // Narrow here, at the GPU draw call — composeBodyMvp returns f64. The sphere
        // blends at its catalog's value; core admits it only while that is above 0.
        const opacity = fade[SEEDED_STAR_REFS.get(star.id)!.item];
        runtime.starRenderer.draw(pass, narrowMat4(mvp), star.color, opacity);
      }
    },

    // Pick aspect — stamps one packed identity per RESOLVED scene-star sphere into
    // the NEAR0 r32uint pick pass, one `drawSphere` per body (each with its own
    // MVP + packed id, so the sphere picks never collapse onto the last star — the
    // writeBuffer-vs-submit race `bodyPickRenderer` guards with per-draw dynamic
    // offsets). The resolved set is the SAME sort `draw` reads, so a star is
    // pickable-as-a-sphere exactly when it draws as a sphere (its complement rides
    // `starPointsPass`'s point pick), never both and never neither.
    //
    // The packed id carries the source + STABLE seed-table index the drawn row
    // was tagged with, NOT its slot in the sort (which shifts as a star crosses
    // its `resolvePx`); one table per source, never merged, so the
    // index means nothing without the code beside it. The MVP folds
    // `oblateness` the same way `draw` does, so the pick silhouette matches.
    //
    // This row self-binds its own @group(0) pick camera inside `drawSphere` (the
    // sphere pick's per-draw uniform), like every other pickable row.
    drawPick(pass, view, ctx, state) {
      const pickRenderer = state.gpu.bodyPickRenderer;
      if (pickRenderer === null) return;

      const spheres = positionedSeededStars(sceneBodyPresentation(ctx).resolved);
      for (const star of spheres) {
        const packedId = packSelection(star.source, star.seedIndex + PICK_SENTINEL_OFFSET);
        // Floor the PICK radius to the shared min footprint (visual sphere
        // untouched) via the shared `drawFlooredSpherePick` recipe: a just-resolved
        // star near its `resolvePx` is only a few pixels across. A resolved star is
        // a rotation-invariant emissive sphere (IDENTITY_MAT3) that carries its
        // measured `oblateness`.
        drawFlooredSpherePick(pickRenderer, pass, {
          vp: view.slab.vp,
          positionMpc: star.positionMpc,
          radiusMpc: star.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC,
          camPosMpc: view.camPos,
          drawPxPerRad: ctx.drawPxPerRad,
          orientation: IDENTITY_MAT3,
          oblateness: star.oblateness,
          packedId,
        });
      }
    },
  };
}
