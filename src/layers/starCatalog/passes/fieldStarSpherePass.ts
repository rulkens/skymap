/**
 * fieldStarSpherePass — the true-scale sphere for the ONE Gaia star the camera
 * is resolving (its sprite is retired in-shader up close, where f32 swims).
 * Presence is PROXIMITY, never selection: `enabled` stores the nearest
 * resolvable star, under a hysteresis band (ON at `STAR_RESOLVE_PX`, OFF below
 * `OFF_FRACTION` of it); `draw`/`drawPick` read it. The f64 slab VP goes through
 * `composeBodyMvp`; the pick radius floors at `minPickRadiusMpc` and stamps the
 * point pick's packed id (`poolRecordIndex`).
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { Octree } from '../../../@types/octree/Octree';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SOLAR_RADIUS_KM } from '../../../data/bodies/solarRadiusKm';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { composeBodyMvp } from '../../../utils/camera/composeBodyMvp';
import { IDENTITY_MAT3 } from '../../../utils/math/identityMat3';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { STAR_RESOLVE_PX } from '../../../data/bodies/starResolvePx';
import { starTintFromBpRp } from '../../../utils/color/starTintFromBpRp';
import { drawFlooredSpherePick } from '../../../services/engine/helpers/drawFlooredSpherePick';
import { nearestResolvableStar } from '../../../services/engine/helpers/nearestResolvableStar';
import { octreeResidency } from '../../../services/octree/octreeResidency';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarColumns } from '../../../@types/data/starCatalog/StarColumns';
import type { StarCatalogId } from '../../../@types/data/starCatalog/StarCatalogId';
import { SOURCE_REGISTRY } from '../../../data/sources';

/** The star this layer currently draws a sphere for — the presence memory. */
type PresentStar = { ordinal: number; positionMpc: Vec3; bpRp: number };

/** OFF threshold as a fraction of ON: the hysteresis band camera jitter cannot cross. */
const OFF_FRACTION = 0.8;

/** Keyed by the catalog object, so a tier swap starts empty. `null` and absent both mean not present. */
const presentByCatalog = new WeakMap<Octree<StarColumns>, PresentStar | null>();

/** The sole loaded star catalog (first committed Gaia catalog), or null. */
function currentCatalog(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
): { source: SourceType; octree: Octree<StarColumns> } | null {
  for (const loaded of runtime.renderer.loadedCatalogs()) return loaded;
  return null;
}

/**
 * The camera-to-star distance (Mpc) at which a solar-radius sphere subtends
 * exactly `thresholdPx` — the inverse of `apparentSizePx` for a body whose
 * diameter is `2 × SOLAR_RADIUS_KM`. Presence turns on at the `STAR_RESOLVE_PX`
 * distance and off at the (larger) `OFF_FRACTION × STAR_RESOLVE_PX` distance.
 */
function resolveDistanceMpc(thresholdPx: number, pxPerRad: number): number {
  const diameterKpc = (SOLAR_RADIUS_KM * 2 * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
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
  nearest: { ordinal: number; positionMpc: Vec3; bpRp: number; distanceMpc: number } | null,
  camPosMpc: Readonly<Vec3>,
  onMpc: number,
  offMpc: number,
): PresentStar | null {
  if (current !== null) {
    if (nearest !== null && nearest.ordinal === current.ordinal) return current;
    if (nearest !== null && nearest.distanceMpc <= onMpc) {
      return { ordinal: nearest.ordinal, positionMpc: nearest.positionMpc, bpRp: nearest.bpRp };
    }
    return distanceMpc(current.positionMpc, camPosMpc) <= offMpc ? current : null;
  }
  if (nearest !== null && nearest.distanceMpc <= onMpc) {
    return { ordinal: nearest.ordinal, positionMpc: nearest.positionMpc, bpRp: nearest.bpRp };
  }
  return null;
}

export function fieldStarSpherePass(runtime: StarCatalogRuntime): ContentPass<'starCatalog'> {
  return {
    name: 'field-star-sphere',
    fade: 'starCatalog',

    enabled(_state, ctx, _view, fade) {
      // The presence query needs the live catalog; null (no catalog committed
      // yet), or one handed 0, disables before any distance math.
      const loaded = currentCatalog(runtime);
      if (loaded === null || fade[SOURCE_REGISTRY[loaded.source].id as StarCatalogId] === 0) {
        return false;
      }
      const catalog = loaded.octree;

      const onMpc = resolveDistanceMpc(STAR_RESOLVE_PX, ctx.drawPxPerRad);
      const offMpc = resolveDistanceMpc(STAR_RESOLVE_PX * OFF_FRACTION, ctx.drawPxPerRad);

      // Search out to the OFF radius (the farthest a present star can linger); the
      // ON/OFF gate then decides adopt/keep/drop. Idempotent for a fixed camera —
      // re-running re-derives the same present star from the same stored state.
      const current = presentByCatalog.get(catalog) ?? null;
      const nearest = nearestResolvableStar(
        catalog,
        octreeResidency(runtime.chunkStreams, loaded.source),
        ctx.drawCamPos,
        offMpc,
      );
      const next = nextPresent(current, nearest, ctx.drawCamPos, onMpc, offMpc);
      presentByCatalog.set(catalog, next);
      return next !== null;
    },

    draw(pass, view, _ctx, _state, fade) {
      const loaded = currentCatalog(runtime);
      if (loaded === null) return;
      const present = presentByCatalog.get(loaded.octree);
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
      const opacity = fade[SOURCE_REGISTRY[loaded.source].id as StarCatalogId];
      runtime.starRenderer.draw(pass, narrowMat4(mvp), starTintFromBpRp(present.bpRp), opacity);
    },

    // Pick aspect — stamps the present star's identity into the NEAR0 r32uint pick
    // pass with ONE `drawSphere`, mirroring `draw` except the pick radius is FLOORED
    // to the shared min footprint (`minPickRadiusMpc`) so a just-resolved few-pixel
    // star stays clickable. `enabled` has already stored the present star, so this
    // runs exactly when `draw` runs; it READS that stored star (never re-queries).
    // The packed id carries the star's pool index — the very index the point pick
    // fragment packs — so the sphere pick resolves to the SAME star; a star whose
    // chunk has left the pool stamps nothing. Both pick pipelines depth-test +
    // depth-write the shared NEAR0 depth, so the near sphere wins nearest-first.
    drawPick(pass, view, ctx, state) {
      const pickRenderer = state.gpu.bodyPickRenderer;
      if (pickRenderer === null) return;
      const loaded = currentCatalog(runtime);
      if (loaded === null) return;
      const present = presentByCatalog.get(loaded.octree);
      if (!present) return;
      const poolIndex = runtime.renderer.poolRecordIndex(loaded.source, present.ordinal);
      if (poolIndex === null) return;
      runtime.renderer.snapshotPickSlots();

      drawFlooredSpherePick(pickRenderer, pass, {
        vp: view.slab.vp,
        positionMpc: present.positionMpc,
        radiusMpc: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_MPC,
        camPosMpc: view.camPos,
        drawPxPerRad: ctx.drawPxPerRad,
        orientation: IDENTITY_MAT3,
        packedId: packSelection(loaded.source, poolIndex + PICK_SENTINEL_OFFSET),
      });
    },
  };
}
