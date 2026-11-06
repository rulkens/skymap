/**
 * surfaceTileStream — the sole owner of surface-tile residency, ONE body's
 * atlases at a time (`SURFACE_TILE_REGISTRY`). `planSurfaceTiles` reads the
 * live `residency` and decides; `apply` carries the plan out: fetch a wanted
 * manifest, engage or release the atlases, stamp every touched key, then
 * allocate and fetch the misses. Tile keys (`surfaceTilePath` under the
 * engaged manifest's prefix) never leave this file. One lane per product
 * (`SURFACE_TILE_LANE_SPECS`): a `tileStreamSubsystem` owning that atlas's LRU
 * clock and fetch queue, beside the residency map `residentSlot` and the
 * terrain queries answer from.
 */

import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileBodyId } from '../../format/@types/SurfaceTileBodyId';
import type { SurfaceTileProduct } from '../../format/@types/SurfaceTileProduct';
import type { ResidentSlot } from '../@types/ResidentSlot';
import type { ResidentSurfaceTile } from '../@types/ResidentSurfaceTile';
import type { SurfaceTilePlan } from '../../plan/@types/SurfaceTilePlan';
import type { SurfaceTileResidency } from '../@types/SurfaceTileResidency';
import type { SceneBodyId } from '../../../../../@types/scene/SceneBodyId';
import type { SurfaceTilePlannerParams } from '../../plan/@types/SurfaceTilePlannerParams';
import type { SurfaceTileDebugSnapshot } from '../../debug/@types/SurfaceTileDebugSnapshot';
import type { SurfaceTileLane } from '../@types/SurfaceTileLane';
import type { SurfaceTileLaneSpec } from '../@types/SurfaceTileLaneSpec';
import type { SurfaceTilePayload } from '../@types/SurfaceTilePayload';
import type { SurfaceTileStream } from '../@types/SurfaceTileStream';
import type { SurfaceTileStreamDeps } from '../@types/SurfaceTileStreamDeps';
import type { Destroyable } from '../../../../../@types/rendering/Destroyable';
import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { ResidentHeightLookup } from '../@types/ResidentHeightLookup';
import { createTileStreamSubsystem } from '../../../../../services/engine/subsystems/tileStreamSubsystem';
import { TextureAtlas } from '../../../../../services/gpu/resources/textureAtlas';
import { uploadBitmapToAtlas } from '../../../../../utils/gpu/uploadBitmapToAtlas';
import { closeBitmap } from '../../../../../utils/gpu/closeBitmap';
import { SURFACE_TILE_REGISTRY } from '../../format/data/surfaceTileRegistry';
import { SURFACE_TILE_PRODUCTS } from '../../format/data/surfaceTileProducts';
import { surfaceTilePath } from '../../format/utils/surfaceTilePath';
import { fetchSurfaceTileManifest } from '../load/fetchSurfaceTileManifest';
import { createArchiveTileSource } from '../load/createArchiveTileSource';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';
import { directionToLonLatDeg } from '../../../../../utils/geo/directionToLonLatDeg';
import { deepestBandLevelAt } from './deepestBandLevelAt';
import { terrainHeightM } from './terrainHeightM';
import { SURFACE_TILE_CONCURRENCY } from '../../format/data/surfaceTileParams';
import { SURFACE_TILE_LANE_SPECS } from '../data/surfaceTileLaneSpecs';

const EMPTY_STATS: ReturnType<SurfaceTileStream['debugStats']> = {
  engaged: false,
  bodyId: null,
  capacity: 0,
  used: 0,
  height: { used: 0, capacity: 0 },
  levels: [],
  droppedAllocations: 0,
  deepestLevelKeys: [],
};

/** The "nothing here yet" snapshot: the Layer's seeded fact and `selectSurfaceTileDebug`'s fallback. */
export const EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT: SurfaceTileDebugSnapshot = {
  ...EMPTY_STATS,
  plan: null,
};

const ABSENT: ReturnType<SurfaceTileResidency['manifest']> = { status: 'absent', value: null };

export function createSurfaceTileStream(deps: SurfaceTileStreamDeps): SurfaceTileStream {
  const { device, requestRender } = deps;

  const manifests = new Map<SurfaceTileBodyId, ReturnType<SurfaceTileResidency['manifest']>>();

  // One lifecycle for the lanes, the body and its tile prefix: set by
  // `engage`, cleared by `standDown`.
  let atlas: {
    readonly lanes: Partial<Record<SurfaceTileProduct, SurfaceTileLane>>;
    readonly bodyId: SceneBodyId & SurfaceTileBodyId;
    readonly prefix: string;
    readonly source: SurfaceTileSource;
  } | null = null;

  const engagedLanes = (): SurfaceTileLane[] => (atlas === null ? [] : Object.values(atlas.lanes));
  let droppedAllocations = 0;
  let frame = 0;
  let destroyed = false;

  function requestManifest(bodyId: SurfaceTileBodyId): void {
    if (manifests.has(bodyId)) return;
    manifests.set(bodyId, { status: 'pending', value: null });
    void fetchSurfaceTileManifest(SURFACE_TILE_REGISTRY[bodyId].manifestKey).then((fetched) => {
      if (destroyed) return;
      // `failed` is final: a 404 is never refetched.
      manifests.set(
        bodyId,
        fetched === null ? { status: 'failed', value: null } : { status: 'loaded', value: fetched },
      );
    });
  }

  function createLane(spec: SurfaceTileLaneSpec): SurfaceTileLane {
    const resident = new Map<string, ResidentSurfaceTile>();
    const pendingLevelOf = new Map<string, number>();
    const stream = createTileStreamSubsystem<SurfaceTilePayload, TextureAtlas>({
      slots: new TextureAtlas(device, spec),
      requestRender,
      concurrency: SURFACE_TILE_CONCURRENCY,
      upload: (laneAtlas, slotIdx, payload) =>
        uploadBitmapToAtlas(laneAtlas, slotIdx, payload.bitmap),
      release: (payload) => closeBitmap(payload.bitmap),
    });
    // Recycled slot; drop so `residentSlot` stays a pure projection of residency.
    // A queued fetch dropped on eviction never reports back, so its pending row goes here.
    stream.setEvictHandler((key) => {
      resident.delete(key);
      pendingLevelOf.delete(key);
    });
    return { stream, resident, pendingLevelOf };
  }

  /** A lane for each product some band bakes: an atlas no band fills is GPU memory for nothing. */
  function engage(bodyId: SceneBodyId & SurfaceTileBodyId): void {
    const manifest = manifests.get(bodyId)?.value;
    if (manifest === null || manifest === undefined) return;
    const lanes: Partial<Record<SurfaceTileProduct, SurfaceTileLane>> = {};
    for (const product of SURFACE_TILE_PRODUCTS) {
      if (!manifest.bands.some((band) => band.builtFrom[product] !== undefined)) continue;
      lanes[product] = createLane(SURFACE_TILE_LANE_SPECS[product]);
    }
    atlas = {
      lanes,
      bodyId,
      prefix: manifest.prefix,
      source: createArchiveTileSource(manifest.prefix),
    };
  }

  /** Destroying a tile stream releases every payload still in flight, so a
   *  late landing never writes the old body's tiles into the new atlases. */
  function standDown(): void {
    for (const lane of engagedLanes()) lane.stream.destroy();
    atlas = null;
  }

  function apply(plan: SurfaceTilePlan): void {
    if (destroyed) return;
    if (plan.wantManifest !== null) requestManifest(plan.wantManifest);
    const { verdict } = plan;
    if (verdict === 'release') standDown();
    else if (verdict !== 'keep') {
      standDown();
      engage(verdict.engage);
    }
    droppedAllocations = 0;
    if (atlas === null) return;
    const streams = atlas;
    frame++;

    // Every key the plan holds is stamped before any allocation: a single
    // allocating pass let a new request evict a resident this same plan wanted
    // moments later (it still carried last frame's stamp), and losing its
    // pixels cascaded into evicting the next.
    for (const tile of plan.touched) {
      streams.lanes[tile.product]?.stream.touch(surfaceTilePath(tile, streams.prefix), frame);
    }

    for (const { tile, screenPx } of plan.requests) {
      const lane = streams.lanes[tile.product];
      if (lane === undefined) continue;
      const key = surfaceTilePath(tile, streams.prefix);
      // Null means the atlas is already full this frame.
      if (lane.stream.allocate(key, frame) === null) {
        droppedAllocations++;
        continue;
      }

      lane.pendingLevelOf.set(key, tile.z);
      lane.stream.enqueueFetch({
        key,
        priority: screenPx,
        fetcher: () => SURFACE_TILE_LANE_SPECS[tile.product].fetch(tile, streams.source),
        onResult: (payload) => {
          lane.pendingLevelOf.delete(key);
          if (payload === null) return;
          // Resolved from the key now, not carried: the slot may have been
          // recycled mid-flight. `upload` closes the bitmap either way.
          const slot = lane.stream.upload(key, payload);
          if (slot === null) return;
          // REAL time, never sim time, so `surfaceTileRenderer`'s crossfade
          // runs while the sim clock is paused or scaled.
          lane.resident.set(key, {
            tile,
            slot,
            readyAtMs: performance.now(),
            subtreeRangeM: payload.subtreeRangeM,
            gridCodes: payload.gridCodes,
          });
        },
      });
    }
  }

  function residentSlot(tile: SurfaceTileId): ResidentSlot | null {
    if (atlas === null) return null;
    const lane = atlas.lanes[tile.product];
    const entry = lane?.resident.get(surfaceTilePath(tile, atlas.prefix));
    if (lane === undefined || entry === undefined) return null;
    const [u0, v0, u1, v1] = lane.stream.slots.slotUv(entry.slot);
    return {
      slot: entry.slot,
      atlasUvOrigin: [u0, v0],
      atlasUvScale: [u1 - u0, v1 - v0],
      readyAtMs: entry.readyAtMs,
      subtreeRangeM: entry.subtreeRangeM,
    };
  }

  const residency: SurfaceTileResidency = {
    manifest: (bodyId) => manifests.get(bodyId) ?? ABSENT,
    residentSlot,
    isInFlight: (tile) => {
      const lane = atlas?.lanes[tile.product];
      if (atlas === null || lane === undefined) return false;
      const key = surfaceTilePath(tile, atlas.prefix);
      return lane.stream.slots.slotOf(key) !== undefined && !lane.stream.isLoaded(key);
    },
    hasFailed: (tile) =>
      atlas?.lanes[tile.product]?.stream.isFailed(surfaceTilePath(tile, atlas.prefix)) ?? false,
    inFlightCount: () => engagedLanes().reduce((sum, lane) => sum + lane.stream.inFlightCount(), 0),
    engagedBodyId: () => atlas?.bodyId ?? null,
  };

  /** Everything `terrainHeightM` needs under one direction, or null for any
   *  body but the engaged one: it has no other body's tiles to fall back to. */
  function heightQueryAt(
    bodyId: SceneBodyId,
    dirBodyFixed: Readonly<Vec3>,
    params: SurfaceTilePlannerParams | null,
  ): {
    readonly deepestLevel: number;
    readonly baseLevel: number;
    readonly resident: ResidentHeightLookup;
  } | null {
    if (atlas === null || atlas.bodyId !== bodyId || params === null) return null;
    const { prefix, lanes } = atlas;
    const { baseLevel } = params;
    return {
      // No band covers this direction → nothing deeper than the whole-globe
      // base is ever baked there, so the climb correctly finds nothing.
      deepestLevel:
        deepestBandLevelAt(params.bands, directionToLonLatDeg(dirBodyFixed)) ?? baseLevel,
      baseLevel,
      resident: (tile) => {
        const entry = lanes.height?.resident.get(surfaceTilePath(tile, prefix));
        if (entry === undefined || entry.gridCodes === null) return null;
        return { gridCodes: entry.gridCodes };
      },
    };
  }

  function heightAt(
    bodyId: SceneBodyId,
    dirBodyFixed: Readonly<Vec3>,
    params: SurfaceTilePlannerParams | null,
  ): number {
    const query = heightQueryAt(bodyId, dirBodyFixed, params);
    if (query === null) return 0;
    return terrainHeightM(dirBodyFixed, query.deepestLevel, query.baseLevel, query.resident);
  }

  /** Runs the real climb with an instrumented lookup rather than a second
   *  address derivation, so the level reported is the one the height came from. */
  function residentHeightLevelAt(
    bodyId: SceneBodyId,
    dirBodyFixed: Readonly<Vec3>,
    params: SurfaceTilePlannerParams | null,
  ): number | null {
    const query = heightQueryAt(bodyId, dirBodyFixed, params);
    if (query === null) return null;
    let level: number | null = null;
    terrainHeightM(dirBodyFixed, query.deepestLevel, query.baseLevel, (tile) => {
      const found = query.resident(tile);
      // The climb stops at its first non-null.
      if (found !== null) level = tile.z;
      return found;
    });
    return level;
  }

  /** Built only for the DebugPanel's throttled readout (at most 4 Hz, and only
   *  while the panel is open), so an O(resident) scan is fine. The per-level
   *  rows are albedo's: imagery is what the walk visibly lacks. */
  function debugStats(): ReturnType<SurfaceTileStream['debugStats']> {
    if (atlas === null) return EMPTY_STATS;
    const { lanes } = atlas;
    const albedo = lanes.albedo;
    const byLevel = new Map<number, { resident: number; pending: number }>();
    const rowFor = (z: number) => {
      let row = byLevel.get(z);
      if (!row) {
        row = { resident: 0, pending: 0 };
        byLevel.set(z, row);
      }
      return row;
    };
    const resident = [...(albedo?.resident.values() ?? [])];
    for (const entry of resident) rowFor(entry.tile.z).resident++;
    for (const z of albedo?.pendingLevelOf.values() ?? []) rowFor(z).pending++;
    const levels = [...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([z, counts]) => ({ z, ...counts }));
    const deepestZ = levels.length === 0 ? -1 : levels[levels.length - 1]!.z;
    const deepestLevelKeys: string[] = [];
    for (const entry of resident) {
      if (entry.tile.z !== deepestZ || deepestLevelKeys.length >= 16) continue;
      deepestLevelKeys.push(`${entry.tile.x},${entry.tile.y}`);
    }
    const occupancy = (product: SurfaceTileProduct) => {
      const lane = lanes[product];
      const { atlasSide, slotSide } = SURFACE_TILE_LANE_SPECS[product];
      return lane === undefined
        ? { used: 0, capacity: 0 }
        : { used: lane.stream.occupiedCount(), capacity: (atlasSide / slotSide) ** 2 };
    };
    return {
      engaged: true,
      bodyId: atlas.bodyId,
      ...occupancy('albedo'),
      height: occupancy('height'),
      levels,
      droppedAllocations,
      deepestLevelKeys,
    };
  }

  const tileStream: SurfaceTileStream = {
    residency,
    apply,
    heightAt,
    residentHeightLevelAt,
    getAtlasView: (product) => atlas?.lanes[product]?.stream.slots.getTextureView() ?? null,
    debugStats,
    destroy() {
      destroyed = true;
      standDown();
      manifests.clear();
    },
  };
  tileStream satisfies Destroyable;
  return tileStream;
}
