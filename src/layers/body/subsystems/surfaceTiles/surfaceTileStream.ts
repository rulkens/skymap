/**
 * surfaceTileStream — the sole owner of surface-tile residency, ONE body's
 * atlases at a time (`SURFACE_TILE_REGISTRY`). `planSurfaceTiles` reads the
 * live `residency` and decides; `apply` carries the plan out: fetch a wanted
 * manifest, engage or release the atlases, stamp every touched key, then
 * allocate and fetch the misses. Tile keys (`surfaceTilePath` under the
 * engaged manifest's prefix) never leave this file. `tileStreamSubsystem`
 * owns each atlas's LRU clock and fetch queue; this file keeps the
 * per-product residency maps `residentSlot` and the terrain queries answer from.
 */

import type { SurfaceTileId } from '../../../../@types/data/SurfaceTileId';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import type { ResidentSlot } from '../../@types/ResidentSlot';
import type { ResidentSurfaceTile } from '../../@types/ResidentSurfaceTile';
import type { SurfaceTilePlan } from '../../@types/SurfaceTilePlan';
import type { SurfaceTileResidency } from '../../@types/SurfaceTileResidency';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { SurfaceTilePlannerParams } from '../../@types/SurfaceTilePlannerParams';
import type { SurfaceTileDebugSnapshot } from '../../@types/SurfaceTileDebugSnapshot';
import type { HeightTileImage } from '../../../../@types/scene/HeightTileImage';
import type { SurfaceTileStream } from '../../@types/SurfaceTileStream';
import type { SurfaceTileStreamDeps } from '../../@types/SurfaceTileStreamDeps';
import type { TileStreamSubsystem } from '../../../../@types/engine/subsystems/tileStreamSubsystem/TileStreamSubsystem';
import type { Destroyable } from '../../../../@types/rendering/Destroyable';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { ResidentHeightLookup } from '../../../../@types/scene/ResidentHeightLookup';
import { createTileStreamSubsystem } from '../../../../services/engine/subsystems/tileStreamSubsystem';
import { TextureAtlas } from '../../../../services/gpu/resources/textureAtlas';
import { uploadBitmapToAtlas } from '../../../../utils/gpu/uploadBitmapToAtlas';
import { closeBitmap } from '../../../../utils/gpu/closeBitmap';
import { SURFACE_TILE_REGISTRY } from '../../../../data/bodies/surfaceTileRegistry';
import { surfaceTilePath } from '../../../../utils/surfaceTiles/surfaceTilePath';
import { fetchSurfaceTileManifest } from '../../load/fetchSurfaceTileManifest';
import { fetchSurfaceTileBitmap } from '../../load/fetchSurfaceTileBitmap';
import { fetchHeightTile } from '../../load/fetchHeightTile';
import { directionToLonLatDeg } from '../../../../utils/geo/directionToLonLatDeg';
import { deepestBandLevelAt } from './deepestBandLevelAt';
import { terrainHeightM } from './terrainHeightM';
import {
  SURFACE_TILE_ATLAS_SIDE,
  SURFACE_TILE_CONCURRENCY,
  HEIGHT_TILE_ATLAS_SIDE,
  HEIGHT_ATLAS_SLOTS_PER_ROW,
} from '../../../../data/bodies/surfaceTileParams';
import { HEIGHT_POSTS_PER_TILE } from '../../../../data/scene/heightTileFormat';

const ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';
/** Terrain-RGB codes the shader decodes (`lattice.wesl`'s `postHeightM`), so
 *  never `-srgb`: the bytes are not colour. */
const HEIGHT_ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm';

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

/** The "nothing here yet" snapshot, shared with `engine.ts`'s debug handle. */
export const EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT: SurfaceTileDebugSnapshot = {
  ...EMPTY_STATS,
  plan: null,
  subCamera: null,
};

const ABSENT: ReturnType<SurfaceTileResidency['manifest']> = { status: 'absent', value: null };

export function createSurfaceTileStream(deps: SurfaceTileStreamDeps): SurfaceTileStream {
  const { device, requestRender } = deps;

  const manifests = new Map<SurfaceTileBodyId, ReturnType<SurfaceTileResidency['manifest']>>();

  // One lifecycle for the atlases, their row geometry, the body and its tile
  // prefix: set by `engage`, cleared by `standDown`.
  let atlas: {
    readonly stream: TileStreamSubsystem<ImageBitmap, TextureAtlas>;
    readonly heightStream: TileStreamSubsystem<HeightTileImage, TextureAtlas>;
    readonly slotsPerRow: number;
    readonly bodyId: SceneBodyId & SurfaceTileBodyId;
    readonly prefix: string;
  } | null = null;

  // One map per product: the two atlases have different slot geometry, so a
  // slot number only means something beside the stream it came from.
  const resident = new Map<string, ResidentSurfaceTile>();
  const heightResident = new Map<string, ResidentSurfaceTile>();
  // key -> z, for the debug stats' per-level pending counts; cleared where the
  // fetch resolves or its slot is evicted.
  const pendingLevelOf = new Map<string, number>();
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

  function engage(bodyId: SceneBodyId & SurfaceTileBodyId, tilePx: number): void {
    const manifest = manifests.get(bodyId)?.value;
    if (manifest === null || manifest === undefined) return;
    const stream = createTileStreamSubsystem<ImageBitmap, TextureAtlas>({
      slots: new TextureAtlas(device, {
        atlasSide: SURFACE_TILE_ATLAS_SIDE,
        slotSide: tilePx,
        format: ATLAS_FORMAT,
        label: 'surface-tiles-albedo',
      }),
      requestRender,
      concurrency: SURFACE_TILE_CONCURRENCY,
      upload: uploadBitmapToAtlas,
      release: closeBitmap,
    });
    // Post count and the Terrain-RGB format are compiled constants, not manifest fields
    // (spec §5.2), so the height atlas's geometry never depends on the bake.
    const heightStream = createTileStreamSubsystem<HeightTileImage, TextureAtlas>({
      slots: new TextureAtlas(device, {
        atlasSide: HEIGHT_TILE_ATLAS_SIDE,
        slotSide: HEIGHT_POSTS_PER_TILE,
        format: HEIGHT_ATLAS_FORMAT,
        label: 'surface-tiles-height',
      }),
      requestRender,
      concurrency: SURFACE_TILE_CONCURRENCY,
      upload: (heightAtlas, slotIdx, image) =>
        uploadBitmapToAtlas(heightAtlas, slotIdx, image.bitmap),
      release: (image) => closeBitmap(image.bitmap),
    });
    // Recycled slot; drop so `residentSlot` stays a pure projection of residency.
    // A queued fetch dropped on eviction never reports back, so its pending row goes here.
    stream.setEvictHandler((key) => {
      resident.delete(key);
      pendingLevelOf.delete(key);
    });
    heightStream.setEvictHandler((key) => heightResident.delete(key));
    atlas = {
      stream,
      heightStream,
      slotsPerRow: SURFACE_TILE_ATLAS_SIDE / tilePx,
      bodyId,
      prefix: manifest.prefix,
    };
  }

  /** Destroying a tile stream releases every payload still in flight, so a
   *  late landing never writes the old body's tiles into the new atlases. */
  function standDown(): void {
    atlas?.stream.destroy();
    atlas?.heightStream.destroy();
    atlas = null;
    resident.clear();
    heightResident.clear();
    pendingLevelOf.clear();
  }

  function apply(plan: SurfaceTilePlan): void {
    if (destroyed) return;
    if (plan.wantManifest !== null) requestManifest(plan.wantManifest);
    const { verdict } = plan;
    if (verdict === 'release') standDown();
    else if (verdict !== 'keep') {
      standDown();
      engage(verdict.engage, verdict.tilePx);
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
      streamOf(streams, tile).touch(surfaceTilePath(tile, streams.prefix), frame);
    }

    for (const request of plan.requests) {
      const key = surfaceTilePath(request.tile, streams.prefix);
      const isHeight = request.tile.product === 'height';
      // Null means the atlas is already full this frame.
      if (streamOf(streams, request.tile).allocate(key, frame) === null) {
        droppedAllocations++;
        continue;
      }

      if (isHeight) {
        streams.heightStream.enqueueFetch({
          key,
          priority: request.screenPx,
          fetcher: () => fetchHeightTile(request.tile, streams.prefix),
          onResult: (image) => {
            if (image === null) return;
            const slot = streams.heightStream.upload(key, image);
            if (slot === null) return;
            // Height has no fade (R14's ancestor fallback makes one tile's
            // stamp meaningless), but the residency record is shared.
            heightResident.set(key, {
              tile: request.tile,
              slot,
              readyAtMs: performance.now(),
              subtreeRangeM: [image.subtreeMinM, image.subtreeMaxM],
              gridCodes: image.gridCodes,
            });
          },
        });
        continue;
      }

      pendingLevelOf.set(key, request.tile.z);
      streams.stream.enqueueFetch({
        key,
        priority: request.screenPx,
        fetcher: () => fetchSurfaceTileBitmap(request.tile, streams.prefix),
        onResult: (bitmap) => {
          pendingLevelOf.delete(key);
          if (bitmap === null) return;
          // Resolved from the key now, not carried: the slot may have been
          // recycled mid-flight. `upload` closes `bitmap` either way.
          const slot = streams.stream.upload(key, bitmap);
          if (slot === null) return;
          // REAL time, never sim time, so `surfaceTileRenderer`'s crossfade
          // runs while the sim clock is paused or scaled.
          resident.set(key, {
            tile: request.tile,
            slot,
            readyAtMs: performance.now(),
            subtreeRangeM: null,
            gridCodes: null,
          });
        },
      });
    }
  }

  const streamOf = (held: NonNullable<typeof atlas>, tile: SurfaceTileId) =>
    tile.product === 'height' ? held.heightStream : held.stream;

  function residentSlot(tile: SurfaceTileId): ResidentSlot | null {
    if (atlas === null) return null;
    const key = surfaceTilePath(tile, atlas.prefix);
    const isHeight = tile.product === 'height';
    const entry = (isHeight ? heightResident : resident).get(key);
    if (entry === undefined) return null;
    const [u0, v0, u1, v1] = (isHeight ? atlas.heightStream : atlas.stream).slots.slotUv(
      entry.slot,
    );
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
      if (atlas === null) return false;
      const key = surfaceTilePath(tile, atlas.prefix);
      const holder = streamOf(atlas, tile);
      return holder.slots.slotOf(key) !== undefined && !holder.isLoaded(key);
    },
    hasFailed: (tile) =>
      atlas !== null && streamOf(atlas, tile).isFailed(surfaceTilePath(tile, atlas.prefix)),
    inFlightCount: () =>
      atlas === null ? 0 : atlas.stream.inFlightCount() + atlas.heightStream.inFlightCount(),
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
    const { prefix } = atlas;
    const { baseLevel } = params;
    return {
      // No band covers this direction → nothing deeper than the whole-globe
      // base is ever baked there, so the climb correctly finds nothing.
      deepestLevel:
        deepestBandLevelAt(params.bands, directionToLonLatDeg(dirBodyFixed)) ?? baseLevel,
      baseLevel,
      resident: (tile) => {
        const entry = heightResident.get(surfaceTilePath(tile, prefix));
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

  /** Built on demand for a low-rate DebugPanel poll, never from a render
   *  path, so an O(resident) scan is fine. */
  function debugStats(): ReturnType<SurfaceTileStream['debugStats']> {
    if (atlas === null) return EMPTY_STATS;
    const byLevel = new Map<number, { resident: number; pending: number }>();
    const rowFor = (z: number) => {
      let row = byLevel.get(z);
      if (!row) {
        row = { resident: 0, pending: 0 };
        byLevel.set(z, row);
      }
      return row;
    };
    for (const entry of resident.values()) rowFor(entry.tile.z).resident++;
    for (const z of pendingLevelOf.values()) rowFor(z).pending++;
    const levels = [...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([z, counts]) => ({ z, ...counts }));
    const deepestZ = levels.length === 0 ? -1 : levels[levels.length - 1]!.z;
    const deepestLevelKeys: string[] = [];
    for (const entry of resident.values()) {
      if (entry.tile.z !== deepestZ || deepestLevelKeys.length >= 16) continue;
      deepestLevelKeys.push(`${entry.tile.x},${entry.tile.y}`);
    }
    return {
      engaged: true,
      bodyId: atlas.bodyId,
      capacity: atlas.slotsPerRow * atlas.slotsPerRow,
      used: atlas.stream.occupiedCount(),
      height: {
        used: atlas.heightStream.occupiedCount(),
        capacity: HEIGHT_ATLAS_SLOTS_PER_ROW * HEIGHT_ATLAS_SLOTS_PER_ROW,
      },
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
    getAtlasView: () => atlas?.stream.slots.getTextureView() ?? null,
    getHeightAtlasView: () => atlas?.heightStream.slots.getTextureView() ?? null,
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
