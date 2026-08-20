/**
 * fieldStarSphereLayer — the close-range, true-scale sphere for the ONE
 * catalogued Gaia field star the camera has descended into resolving range of.
 *
 * ### Why this layer exists
 *
 * Flying the camera down to solar-radius distance of a survey star leaves it
 * with no geometry: its `starCatalog` point sprite is deliberately
 * distance-retired in-shader near the camera, because `vertex.wesl`
 * reconstructs each star as `originRelCam + offset·cellScale` in f32, whose two
 * nearly-cancelling terms carry AU-scale error within ~a couple of AU of the
 * star (an f32 swim). So at close range the sprite is gone and the descent
 * bottoms out on nothing. This layer builds the missing surface: a real sphere
 * for the nearest resolvable star, composed on the f64 camera-relative
 * scene-body path where that geometry is well-conditioned.
 *
 * ### Presence is PROXIMITY, not selection
 *
 * WHICH star gets a sphere is a fact about where the camera is, not about what is
 * selected. Each frame the layer asks `nearestResolvableStar` for the nearest
 * catalogued star within the resolve radius of `ctx.drawCamPos` and draws THAT
 * one — reading `state.selectionRows` nowhere. Selection only DECORATES the
 * result (the halo `near0SelectionRingLayer` draws, the InfoCard the reconciler
 * fills); it never decides whether the body exists. This is the load-bearing
 * un-braid: clicking the background nulls both selection slots, but the star the
 * camera is parked at must keep its sphere, because that sphere is its only
 * close-range geometry and the camera has not moved.
 *
 * No `FOREGROUND_MAX_DISTANCE_MPC` cut applies here: the proximity test above
 * already subsumes it by ~10.5 orders of magnitude (decision #16 D6).
 *
 * ### The presence hysteresis band — killing the threshold strobe
 *
 * A single distance threshold would strobe the sphere on and off under the
 * sub-pixel camera jitter of an orbiting view: one frame the star clears
 * STAR_RESOLVE_PX, the next it dips just under. So presence rides a hysteresis
 * band. A star turns ON only once its solar-radius sphere clears
 * `STAR_RESOLVE_PX` (4 px), and once present it stays present until it recedes
 * below `OFF_FRACTION × STAR_RESOLVE_PX` (3.2 px) — a band no single-frame jitter
 * can cross. Nearest-wins arbitrates a change of subject: a DIFFERENT star that
 * has itself crossed the ON threshold takes over immediately (the camera has
 * clearly moved to it), but a merely-nearer star still in the band does not
 * dislodge the one already shown. The present star is remembered per catalog in a
 * `WeakMap` — the same catalog-keyed, tier-swap-isolated pattern
 * `starCatalogLayer`'s fade state uses.
 *
 * `enabled` runs the query and STORES the result; `draw` / `drawPick` READ the
 * stored star (never re-query), so the sphere they stamp and the presence flag
 * the executor gated on cannot disagree. `enabled` may run more than once per
 * frame (the pick program consults it too); the update is idempotent for a given
 * camera and stored state — a second call with the same camera re-derives the
 * same present star and re-stores it unchanged.
 *
 * ### Why option B (a thin sphere layer), NOT option A (a transient scene star)
 *
 * Appending the resolved star to `visibleStars(state)` so
 * `partitionStarsByResolution` / `starSpheresLayer` pick it up "for free" reads
 * tidy but braids two independent things: it makes the authored SCENE-BODY star
 * set (a static seed table + one settings toggle) depend on the RUNTIME star cut,
 * and it drives the catalog star through the point-partition path it does not
 * need — the star ALREADY has a representation there (its `starCatalog` sprite).
 * Option A would draw the resolved star as a scene point AND a Gaia sprite across
 * the whole foreground range, widening the very sprite/sphere overlap this layer
 * exists to resolve. Option B keeps the scene-body set pure and scopes the new
 * geometry to exactly the near star at exactly close range — growth at the
 * "NEAR0 foreground sphere layer" seam, reusing the RENDERER machinery
 * (`starRenderer`, `composeBodyMvp`, `RENDER_ORIGIN_MPC`, `SCALE_UNITS`) rather
 * than the SCENE-SET machinery (`visibleStars` / `partitionStarsByResolution`),
 * which is authored-body plumbing.
 *
 * ### Why the f64 `composeBodyMvp` seam kills the wobble
 *
 * Like `earthLayer` and `starSpheresLayer`, this reads the slab's `Float64Array`
 * view-projection (`view.slab.vp`) rather than the f32-narrowed `view.vp`. A
 * sphere placed parsecs from the render origin sits where the VP's large
 * translation nearly cancels the tiny position; `composeBodyMvp` resolves that
 * cancellation in double precision BEFORE narrowing to f32, so the sphere lands
 * stable. The sprite's f32 reconstruction cannot — which is why the sprite is
 * retired from the near field in-shader rather than hidden behind this sphere.
 * See `composeBodyMvp`'s module header for the full compose-in-f64-then-narrow
 * argument.
 *
 * ### Colour
 *
 * The sphere is tinted by `starTintFromBpRp(present.bpRp)` — the CPU evaluation
 * of the ONE canonical Gaia BP−RP ramp (`starCatalog/tint.wesl`), so the
 * resolved sphere lands the same colour as the point cloud it rose out of.
 *
 * ### Pick aspect — the sphere occludes the stars behind it
 *
 * `draw` alone leaves the sphere absent from the r32uint pick pass, so the
 * background Gaia point-picks read THROUGH its face and a click lands on a tiny
 * star parsecs behind the one framed. `drawPick` closes both gaps: it stamps the
 * present star's identity into the NEAR0 pick pass via
 * `bodyPickRenderer.drawSphere`, gated by the SAME `enabled` predicate `draw`
 * rides (this layer declares no `pickEnabled`, so its pick gate IS `enabled` and
 * pickability tracks presence) and composing the SAME `composeBodyMvp` — except
 * the pick radius is FLOORED to the shared min footprint (`minPickRadiusMpc`), so
 * a just-resolved few-pixel star still gets a clickable hit area (the visual
 * sphere keeps its true radius). Because the sphere pick pipeline and the
 * `starCatalog` POINT pick pipeline share the pick pass's `depth32float`
 * attachment and both depth-test (`less`) + depth-write, the near sphere occludes
 * the far star points nearest-wins, order-independently.
 *
 * The packed id is `packSelection(Source.GaiaStars, present.recordIdx +
 * PICK_SENTINEL_OFFSET)` — byte-for-byte what `starCatalog/pickFragment.wesl`
 * writes for this star's point pick (`recordIdx` IS the bin-global record index
 * the pick ref carries), so clicking the sphere resolves to the exact same star
 * the point pick would, and the InfoCard/halo decorate the body already present.
 *
 * `RENDER_ORIGIN_MPC` is imported directly (not threaded through ctx state) —
 * the render origin is fixed at the Sun for the zoom-to-earth fold.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { SOLAR_RADIUS_KM } from '../../../../data/bodies/solarRadiusKm';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { IDENTITY_MAT3 } from '../../../../utils/math/identityMat3';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { STAR_RESOLVE_PX } from '../partitionStarsByResolution';
import { starTintFromBpRp } from '../../../../utils/color/starTintFromBpRp';
import { drawFlooredSpherePick } from '../../helpers/drawFlooredSpherePick';
import { nearestResolvableStar } from '../../helpers/nearestResolvableStar';

/** The star this layer currently draws a sphere for — the presence memory. */
type PresentStar = { recordIdx: number; positionMpc: Vec3; bpRp: number };

/**
 * The OFF threshold as a fraction of the ON threshold: a present star recedes to
 * absent only once its sphere shrinks below `OFF_FRACTION × STAR_RESOLVE_PX`,
 * giving the presence flag a hysteresis band the frame-to-frame camera jitter
 * cannot strobe across.
 */
const OFF_FRACTION = 0.8;

/**
 * Per-catalog presence memory. Keyed by the CATALOG object (like
 * `starCatalogLayer`'s fade state) so a tier swap — a fresh catalog object —
 * starts empty and the old entry is GC'd with the WeakMap. Holds the currently
 * shown star, or `null` once nothing is present (both read as "not present").
 */
const presentByCatalog = new WeakMap<StarCatalog, PresentStar | null>();

/** The sole loaded star catalog (first committed Gaia catalog), or null. */
function currentCatalog(state: EngineState): StarCatalog | null {
  const renderer = state.gpu.starCatalogRenderer;
  if (renderer === null) return null;
  for (const { catalog } of renderer.loadedCatalogs()) return catalog;
  return null;
}

/**
 * The camera-to-star distance (Mpc) at which a solar-radius sphere subtends
 * exactly `thresholdPx` — the inverse of `apparentSizePx` for a body whose
 * diameter is `2 × SOLAR_RADIUS_KM`. Presence turns on at the `STAR_RESOLVE_PX`
 * distance and off at the (larger) `OFF_FRACTION × STAR_RESOLVE_PX` distance.
 */
function resolveDistanceMpc(
  thresholdPx: number,
  viewportHeightPx: number,
  fovYRad: number,
): number {
  const diameterKpc = (SOLAR_RADIUS_KM * 2 * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
  const pxPerRad = viewportHeightPx / (2 * Math.tan(fovYRad / 2));
  return (diameterKpc * pxPerRad) / (thresholdPx * 1000);
}

/** Euclidean Mpc distance between a star position and the camera. */
function distanceMpc(positionMpc: Readonly<Vec3>, camPosMpc: Readonly<Vec3>): number {
  return Math.hypot(
    positionMpc[0] - camPosMpc[0],
    positionMpc[1] - camPosMpc[1],
    positionMpc[2] - camPosMpc[2],
  );
}

/**
 * The next present star given the current one and the nearest resolvable star
 * (queried within the OFF radius). The hysteresis rule, nearest-wins:
 *
 *  - if the nearest IS the current one → keep it (it is still within OFF);
 *  - else a DIFFERENT star within the ON distance takes over (nearest wins);
 *  - else keep the current one iff it is itself still within OFF (checked against
 *    its own stored position, since `nearest` names some other/no star);
 *  - with nothing present, adopt the nearest only once it is within ON.
 */
function nextPresent(
  current: PresentStar | null,
  nearest: { recordIdx: number; positionMpc: Vec3; bpRp: number; distanceMpc: number } | null,
  camPosMpc: Readonly<Vec3>,
  onMpc: number,
  offMpc: number,
): PresentStar | null {
  if (current !== null) {
    if (nearest !== null && nearest.recordIdx === current.recordIdx) return current;
    if (nearest !== null && nearest.distanceMpc <= onMpc) {
      return { recordIdx: nearest.recordIdx, positionMpc: nearest.positionMpc, bpRp: nearest.bpRp };
    }
    return distanceMpc(current.positionMpc, camPosMpc) <= offMpc ? current : null;
  }
  if (nearest !== null && nearest.distanceMpc <= onMpc) {
    return { recordIdx: nearest.recordIdx, positionMpc: nearest.positionMpc, bpRp: nearest.bpRp };
  }
  return null;
}

export const fieldStarSphereLayer: ContentLayer = {
  name: 'field-star-sphere',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx) {
    // The presence query needs the live catalog; null (pre-bootstrap / GPU
    // teardown) disables before any distance math.
    const catalog = currentCatalog(state);
    if (catalog === null) return false;

    const onMpc = resolveDistanceMpc(STAR_RESOLVE_PX, ctx.canvasSize.height, ctx.fovYRad);
    const offMpc = resolveDistanceMpc(
      STAR_RESOLVE_PX * OFF_FRACTION,
      ctx.canvasSize.height,
      ctx.fovYRad,
    );

    // Search out to the OFF radius (the farthest a present star can linger); the
    // ON/OFF gate then decides adopt/keep/drop. Idempotent for a fixed camera —
    // re-running re-derives the same present star from the same stored state.
    const current = presentByCatalog.get(catalog) ?? null;
    const nearest = nearestResolvableStar(catalog, ctx.drawCamPos, offMpc);
    const next = nextPresent(current, nearest, ctx.drawCamPos, onMpc, offMpc);
    presentByCatalog.set(catalog, next);
    return next !== null;
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.starRenderer;
    if (renderer === null) return;
    const catalog = currentCatalog(state);
    if (catalog === null) return;
    const present = presentByCatalog.get(catalog);
    if (!present) return;

    // Compose from the slab's f64 vp — see the module header's f64 seam. Radius is
    // the representative solar radius resolved into Mpc. A field star is a flat-
    // emissive, rotation-invariant sphere (IDENTITY_MAT3, no oblateness).
    const mvp = composeBodyMvp(
      view.slab.vp,
      present.positionMpc,
      RENDER_ORIGIN_MPC,
      SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_MPC,
      IDENTITY_MAT3,
    );
    // Narrow here, at the GPU draw call — composeBodyMvp returns f64.
    renderer.draw(pass, narrowMat4(mvp), starTintFromBpRp(present.bpRp));
  },

  // Pick aspect — stamps the present star's identity into the NEAR0 r32uint pick
  // pass with ONE `drawSphere`, mirroring `draw` except the pick radius is FLOORED
  // to the shared min footprint (`minPickRadiusMpc`) so a just-resolved few-pixel
  // star stays clickable. `enabled` has already stored the present star, so this
  // runs exactly when `draw` runs; it READS that stored star (never re-queries).
  // The packed id carries the star's bin-global record index — the very
  // `recordIdx` the point pick fragment packs — so the sphere pick resolves to the
  // SAME star, and both pick pipelines depth-test + depth-write the shared NEAR0
  // depth so the near sphere occludes the far background points nearest-wins.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null) return;
    const catalog = currentCatalog(state);
    if (catalog === null) return;
    const present = presentByCatalog.get(catalog);
    if (!present) return;

    drawFlooredSpherePick(pickRenderer, pass, {
      vp: view.slab.vp,
      positionMpc: present.positionMpc,
      radiusMpc: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_MPC,
      camPosMpc: view.camPos,
      drawPxPerRad: ctx.drawPxPerRad,
      orientation: IDENTITY_MAT3,
      packedId: packSelection(Source.GaiaStars, present.recordIdx + PICK_SENTINEL_OFFSET),
    });
  },
};
