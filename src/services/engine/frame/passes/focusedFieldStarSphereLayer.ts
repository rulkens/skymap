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
 * ### Pick aspect — the sphere occludes the stars behind it
 *
 * `draw` alone leaves the sphere absent from the r32uint pick pass, so the
 * background Gaia point-picks read THROUGH its face and a click lands on a
 * tiny star parsecs behind the one framed. `drawPick` closes both gaps: it
 * stamps the focused star's identity into the NEAR0 pick pass via
 * `bodyPickRenderer.drawSphere`, gated by the SAME `enabled` predicate `draw`
 * rides (the pick program filters pickables by `drawPick` presence +
 * `(pickEnabled ?? enabled)`; this layer declares no `pickEnabled`, so its pick
 * gate IS `enabled` and pickability tracks visibility) and composing the SAME
 * `composeBodyMvp` —
 * except the pick radius is FLOORED to the shared min footprint
 * (`minPickRadiusMpc`), so a just-resolved few-pixel star still gets a clickable
 * hit area (the visual sphere keeps its true radius). Because the sphere
 * pick pipeline and the `starCatalog` POINT pick pipeline share the pick pass's
 * `depth32float` attachment and both depth-test (`less`) + depth-write, the
 * near sphere occludes the far star points nearest-wins, order-independently:
 * the sphere is both itself pickable AND a depth occluder for the stars behind
 * it.
 *
 * The packed id is `packSelection(Source.GaiaStars, row.index + PICK_SENTINEL_OFFSET)`
 * — byte-for-byte what `starCatalog/pickFragment.wesl` writes for this star's
 * point pick (`row.index` IS the bin-global `recordIdx` the pick ref carried),
 * so clicking the sphere resolves to the exact same star the point pick would.
 *
 * `RENDER_ORIGIN_MPC` is imported directly (not threaded through ctx state) —
 * the render origin is fixed at the Sun for the zoom-to-earth fold.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { IDENTITY_MAT3 } from '../../../../utils/math/identityMat3';
import { STAR_RESOLVE_PX } from '../partitionStarsByResolution';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { resolvesToSphere } from '../../../../utils/scene/resolvesToSphere';
import { starTintFromBpRp } from '../../../../utils/color/starTintFromBpRp';
import { drawFlooredSpherePick } from '../../helpers/drawFlooredSpherePick';

/** The narrowed star arm of `SelectionRow` — the only arm this layer draws. */
type StarSelectionRow = Extract<SelectionRow, { type: 'star' }>;

/**
 * The star row this layer draws a sphere for: the `select` slot's row if it is a
 * star, else the `focus` slot's row if it is a star, else null.
 *
 * Why the fallback exists: the `#focus=star-<recordIdx>` URL-restore path
 * dispatches `updateSelectionFocus`, filling ONLY the `focus` slot and leaving
 * `select` null — so reading `select` alone lands the deep link on an invisible
 * star, because the Gaia point sprite is distance-retired in-shader at this range
 * (spec constraint 3) and nothing else draws the body. Both slots hold the same
 * resolved `SelectionRow` shape, so a `focus` star row carries the same
 * positionMpc/radiusKm/bpRp/index the sphere reads.
 *
 * Why the star-check is PER SLOT, not a raw `select ?? focus`: a non-star row
 * lingering in `select` (e.g. a galaxy selected while a star `focus` persists)
 * must not suppress a star sitting in `focus`. Each slot is tested for star-ness
 * independently; `select` wins only when `select` ITSELF is a star.
 */
function focusedStarRow(state: EngineState): StarSelectionRow | null {
  const { select, focus } = state.selectionRows;
  if (select !== null && select.type === 'star') return select;
  if (focus !== null && focus.type === 'star') return focus;
  return null;
}

/**
 * The focused-star sphere resolves iff the resolved `focusedStarRow` (the
 * `select` star, else the `focus` star) has a solar-radius sphere clearing
 * `STAR_RESOLVE_PX` at the camera-to-star distance. Returns the resolvedness
 * given the camera position — shared by `enabled` (reads `ctx.drawCamPos`, the
 * absolute frame) and could be reused by `draw` (which coincides because
 * `RENDER_ORIGIN_MPC` is the origin).
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
    const row = focusedStarRow(state);
    if (row === null) return false;
    return starResolves(row, ctx.drawCamPos, ctx.canvasSize.height, ctx.fovYRad);
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.starRenderer;
    if (renderer === null) return;
    const row = focusedStarRow(state);
    if (row === null) return;

    // Compose from the slab's f64 vp — see the module header's f64 seam. Radius
    // is the stamped solar radius resolved into Mpc. A field star is a flat-
    // emissive, rotation-invariant sphere, so it carries `IDENTITY_MAT3` for
    // orientation; no oblateness (a field star carries no measured spin), so the
    // default sphere compose applies.
    const mvp = composeBodyMvp(
      view.slab.vp,
      row.positionMpc,
      RENDER_ORIGIN_MPC,
      row.radiusKm * SCALE_UNITS.KM_TO_MPC,
      IDENTITY_MAT3,
    );
    renderer.draw(pass, mvp, starTintFromBpRp(row.bpRp));
  },

  // Pick aspect — stamps the focused star's identity into the NEAR0 r32uint pick
  // pass with ONE `drawSphere` (its own dynamic-offset uniform: mvp + packed id).
  // This mirrors `draw` except the pick radius is FLOORED to the shared min
  // footprint (`minPickRadiusMpc`), so a just-resolved few-pixel star stays
  // clickable; `enabled` (the shared `starResolves` gate) has already decided the
  // sphere resolves, so this runs exactly when `draw` runs.
  //
  // The packed id carries the star's bin-global record index — `row.index`, the
  // very `recordIdx` the point pick fragment packs — so the sphere pick resolves
  // to the SAME star as its `starCatalog` point pick. Because both pick pipelines
  // depth-test + depth-write the shared NEAR0 depth attachment, the near sphere
  // occludes the far background star points nearest-wins.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null) return;
    const row = focusedStarRow(state);
    if (row === null) return;

    // Floor the PICK radius to the shared min footprint (visual sphere untouched)
    // via the shared `drawFlooredSpherePick` recipe: the descent gates this sphere
    // on just clearing STAR_RESOLVE_PX, so it can be only a few pixels across. A
    // field star is a rotation-invariant emissive sphere (IDENTITY_MAT3, no
    // oblateness); its identity is the bin-global record index `row.index`, the
    // very `recordIdx` the point pick fragment packs.
    drawFlooredSpherePick(pickRenderer, pass, {
      vp: view.slab.vp,
      positionMpc: row.positionMpc,
      radiusMpc: row.radiusKm * SCALE_UNITS.KM_TO_MPC,
      camPosMpc: view.camPos,
      drawPxPerRad: ctx.drawPxPerRad,
      orientation: IDENTITY_MAT3,
      packedId: packSelection(Source.GaiaStars, row.index + PICK_SENTINEL_OFFSET),
    });
  },
};
