/**
 * surfaceTileSubsystem — the residency half of one body's surface virtual
 * texture, registry-driven and ONE-ENGAGED (`SURFACE_TILE_REGISTRY`).
 * `cutSurfaceTiles` (pure, tested) decides which tiles a frame wants and
 * resolves each visible leaf's atlas residency; `tileStreamSubsystem` owns
 * the atlas, LRU clock and fetch queue. This file turns a fetch demand
 * (`update()`) into allocations and fetches, answers per-tile residency
 * queries (`residentSlot`, the callback `cutSurfaceTiles` resolves through),
 * and carries the frame's resolved cut (`setLastCut`/`getLastCut`) from
 * `runFrame`'s planning block to `earthPass.draw`.
 *
 * `update()` owns both sides of engagement (`plan.zWin > baseLevel`), not
 * just a caller's `if` — a drive-site `if` once left stale tiles drawing
 * after the camera pulled back out. Allocation is lazy: the 67 MB atlas is
 * created by the first engaged `update()`. A `bodyId` change (R7's switch
 * path, untested until F4's Mars row) stands the old body's atlas and
 * residency down before engaging the new one — see `standDown`.
 */

import type { SurfaceTileId } from '../../../@types/data/SurfaceTileId';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { SurfaceTileBodyId } from '../../../@types/data/SurfaceTileBodyId';
import type { SurfaceTileSpec } from '../../../@types/data/SurfaceTileSpec';
import type { SurfaceTileManifest } from '../../../@types/scene/SurfaceTileManifest';
import type { SurfaceTileBand } from '../../../@types/scene/SurfaceTileBand';
import type { SurfaceTilePlan } from '../../../@types/scene/SurfaceTilePlan';
import type { SurfaceTilePlannerParams } from '../../../@types/scene/SurfaceTilePlannerParams';
import type { SurfaceTileRequest } from '../../../@types/scene/SurfaceTileRequest';
import type { SurfaceTileDebugSnapshot } from '../../../@types/scene/SurfaceTileDebugSnapshot';
import type { HeightTileImage } from '../../../@types/scene/HeightTileImage';
import type { SurfaceCutTile } from '../../../@types/scene/SurfaceCutTile';
import type { SurfaceTileSubsystem } from '../../../@types/engine/subsystems/SurfaceTileSubsystem';
import type { TileStreamSubsystem } from '../../../@types/engine/subsystems/TileStreamSubsystem';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { Vec3 } from '../../../@types/math/Vec3';
import { createTileStreamSubsystem } from './tileStreamSubsystem';
import { uploadBitmapToAtlas } from '../../../utils/gpu/uploadBitmapToAtlas';
import { closeBitmap } from '../../../utils/gpu/closeBitmap';
import { SURFACE_TILE_REGISTRY } from '../../../data/bodies/surfaceTileRegistry';
import { surfaceTileBandFromBounds } from '../../../utils/surfaceTiles/surfaceTileBandFromBounds';
import { surfaceTilePath } from '../../../utils/surfaceTiles/surfaceTilePath';
import { fetchSurfaceTileManifest } from '../../../utils/network/fetchSurfaceTileManifest';
import { fetchSurfaceTileBitmap } from '../../../utils/network/fetchSurfaceTileBitmap';
import { fetchHeightTile } from '../../../utils/network/fetchHeightTile';
import { directionToLonLatDeg } from '../../../utils/geo/directionToLonLatDeg';
import { deepestBandLevelAt } from '../../../utils/surfaceTiles/deepestBandLevelAt';
import { terrainHeightM } from '../../../utils/surfaceTiles/terrainHeightM';
import {
  SURFACE_TILE_ATLAS_SIDE,
  SURFACE_TILE_CONCURRENCY,
  SURFACE_TILE_LOD_BIAS,
  SURFACE_TILE_PX,
  HEIGHT_TILE_ATLAS_SIDE,
  HEIGHT_ATLAS_SLOTS_PER_ROW,
} from '../../../data/bodies/surfaceTileParams';
import { HEIGHT_POSTS_PER_TILE } from '../../../data/scene/heightTileFormat';

const ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';
/** Terrain-RGB codes the shader decodes (`lattice.wesl`'s `postHeightM`), so
 *  never `-srgb`: the bytes are not colour. */
const HEIGHT_ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm';

/** The "nothing here yet" snapshot — atlas never allocated, or `state.subsystems.surfaceTiles`
 *  itself is null. Exported so `engine.ts`'s debug handle shares this shape instead of
 *  restating it. */
export const EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT: SurfaceTileDebugSnapshot = {
  engaged: false,
  bodyId: null,
  capacity: 0,
  used: 0,
  height: { used: 0, capacity: 0 },
  levels: [],
  plan: null,
  droppedAllocations: 0,
  deepestLevelKeys: [],
  subCamera: null,
};

/** One atlas-resident tile: which tile, which slot, and when its bitmap
 *  landed (REAL time — see `residentSlot`'s doc comment). */
type ResidentTile = {
  readonly tile: SurfaceTileId;
  readonly slot: number;
  readonly readyAtMs: number;
  /** HEIGHT only: the `SHGT` chunk's subtree bounds, which the walk turns
   *  into frustum-cull headroom for every descendant. Null for albedo. */
  readonly subtreeRangeM: readonly [number, number] | null;
  /** HEIGHT only: the chunk's own 17×17 grid (§8.4), kept in its wire
   *  encoding — 867 B/slot, decoded per query by `terrainHeightAt`'s
   *  `terrainHeightM` call, never eagerly. Null for albedo. */
  readonly gridCodes: Uint8Array | null;
};

export type SurfaceTileDeps = {
  readonly device: GPUDevice;
  /** Wakes the render loop; passed through to the stream subsystem. This file
   *  surfaces its own state through `isAnimating()` instead. */
  readonly requestRender: () => void;
};

export function createSurfaceTileSubsystem(deps: SurfaceTileDeps): SurfaceTileSubsystem {
  const { device, requestRender } = deps;

  // Which body's manifest is requested/pending/loaded. Re-fetched only when
  // `plannerParams` is asked about a DIFFERENT body than this one — a tier
  // change alone (same body) reuses the manifest already on hand.
  let manifestBodyId: BodyId | null = null;
  let manifestPending = false;
  let manifest: SurfaceTileManifest | null = null;

  // The one writer is `refreshParams` — keeping the triple in one record means
  // `bodyId`/`baseLevel`/`params` can never describe different requests (see
  // its doc comment).
  let paramsState: {
    readonly bodyId: BodyId;
    readonly baseLevel: number;
    readonly params: SurfaceTilePlannerParams | null;
  } | null = null;

  // Set together by `engage()`, cleared together by `standDown()`/`destroy()`
  // — the atlas, its row geometry and the body it belongs to have one
  // lifecycle, so one nullable record replaces three fields a null check
  // used to have to keep in sync.
  let atlas: {
    readonly stream: TileStreamSubsystem<ImageBitmap>;
    readonly heightStream: TileStreamSubsystem<HeightTileImage>;
    readonly slotsPerRow: number;
    readonly bodyId: BodyId;
  } | null = null;

  // One map per product rather than one keyed by the (already
  // product-bearing) tile path: the two atlases have different slot geometry,
  // so a slot number only means something alongside the stream it came from.
  const resident = new Map<string, ResidentTile>();
  const heightResident = new Map<string, ResidentTile>();
  // key -> z, for the debug snapshot's per-level pending counts. Written when a
  // fetch is enqueued; cleared in the same `onResult` branches that already
  // handle its resolution (declined or uploaded), so there's no third path to
  // keep in sync.
  const pendingLevelOf = new Map<string, number>();
  // Debug-snapshot readout of the last engaged plan; null exactly while disengaged.
  // `plan` omits `cutCount`: `getDebugSnapshot` fills that in from `lastCut`
  // at READ time (see its own comment for why `update()` time is too early).
  let lastEngaged: {
    readonly plan: Omit<NonNullable<SurfaceTileDebugSnapshot['plan']>, 'cutCount'>;
    readonly droppedAllocations: number;
    readonly subCameraDirLocal: Vec3;
  } | null = null;

  let frameCounter = 0;

  // This frame's (or the last engaged frame's) `cutSurfaceTiles` cut, for
  // `earthPass.draw` to read — the "compute in runFrame, consume in draw"
  // seam `plannerParams`/`update` already use, one field further. Written
  // unconditionally by `runFrame`'s tile-planning block (empty on a
  // disengaged frame), so a stale cut can never survive a camera pull-back.
  let lastCut: readonly SurfaceCutTile[] = [];

  let destroyed = false;

  /**
   * Turn a fetched manifest plus the caller's base level into planner
   * inputs, or null if the bake is one this build cannot address — every
   * rejection degrades to base-only, cheaper to reason about than silently
   * adapting to wrong pixels. `tilePx` is a validated ASSERTION:
   * `residentSlot` derives the atlas's `slotsPerRow` from
   * `SURFACE_TILE_ATLAS_SIDE / tilePx` alone, an identity that holds only at
   * the shipped 512 px edge. `baseLevel` arrives already resolved — WHICH
   * function turns a tier into a level is body-specific (`baseLevelForTier`
   * today), so this generic subsystem no longer calls one itself.
   */
  function derivePlannerParams(
    fetched: SurfaceTileManifest,
    baseLevel: number,
  ): SurfaceTilePlannerParams | null {
    if (fetched.bands.length === 0) return null;
    const tilePx = fetched.tilePx ?? SURFACE_TILE_PX;
    if (tilePx !== SURFACE_TILE_PX) return null;
    const bands: SurfaceTileBand[] = [];
    for (const band of fetched.bands) {
      // Not baked for the albedo product (e.g. a height-only row, once those
      // exist) — this planner only ever requests albedo tiles. Not baked for
      // height either: height inherits from the deepest resident ancestor
      // (R14), but a band missing its own height coverage would still 404
      // every height request in its range — wasted fetches that never land.
      if (band?.builtFrom?.albedo === undefined || band?.builtFrom?.height === undefined) continue;
      // A structurally-wrong manifest entry (missing/malformed `bounds`)
      // degrades by skipping it, matching this function's whole stance —
      // never throw out of `refreshParams` over one bad band.
      if (typeof band?.bounds?.west !== 'number') continue;
      // Deeper of the band's own min and base+1: at/above base would
      // re-download detail the whole-globe base already delivers.
      const min = Math.max(band.min, baseLevel + 1);
      // A band clamped past its own depth at this base level bakes nothing usable.
      if (!(band.max >= min)) continue;
      bands.push(surfaceTileBandFromBounds(band.bounds, min, band.max));
    }
    if (bands.length === 0) return null;
    return {
      tilePx,
      baseLevel,
      bands,
      lodBias: SURFACE_TILE_LOD_BIAS,
    };
  }

  /** The one writer of `paramsState`, so `bodyId`/`baseLevel`/`params` can't
   *  describe different requests. */
  function refreshParams(bodyId: BodyId, baseLevel: number): void {
    paramsState = {
      bodyId,
      baseLevel,
      params: manifest === null ? null : derivePlannerParams(manifest, baseLevel),
    };
  }

  function plannerParams(bodyId: BodyId, baseLevel: number): SurfaceTilePlannerParams | null {
    // Cast: the registry's own declaration stays a literal (`as const
    // satisfies`) so a body-name typo there is a compile error, but that
    // makes it non-indexable by the wider `BodyId` a caller carries.
    const spec = (SURFACE_TILE_REGISTRY as Partial<Record<BodyId, SurfaceTileSpec>>)[bodyId];
    if (spec === undefined) return null;
    // A different body than the one whose manifest is loaded/loading —
    // supersede it. `manifestBodyId` is checked again inside the `.then`,
    // so a fetch superseded by ANOTHER body switch never writes a stale
    // manifest over the one the newer request is waiting on.
    if (manifestBodyId !== bodyId) {
      manifestBodyId = bodyId;
      manifestPending = true;
      manifest = null;
      paramsState = null;
      void fetchSurfaceTileManifest(spec.manifestKey).then((fetched) => {
        if (manifestBodyId === bodyId) manifestPending = false;
        if (destroyed || manifestBodyId !== bodyId || fetched === null) return;
        manifest = fetched;
        // Derived here so `update()` has params ready the same frame.
        refreshParams(bodyId, paramsState?.baseLevel ?? baseLevel);
      });
    }
    if (
      paramsState === null ||
      paramsState.bodyId !== bodyId ||
      paramsState.baseLevel !== baseLevel
    ) {
      refreshParams(bodyId, baseLevel);
    }
    return paramsState !== null && paramsState.bodyId === bodyId ? paramsState.params : null;
  }

  /**
   * Allocate the atlas for `bodyId`. Called by the first engaged frame (or
   * the first frame after a body switch stood the previous one down) and
   * never again per engagement — `slotSide` comes from the manifest's tile
   * edge, so a re-bake at a different edge stays a data change.
   */
  function engage(tilePx: number, bodyId: BodyId): NonNullable<typeof atlas> {
    const slotsPerRow = SURFACE_TILE_ATLAS_SIDE / tilePx;
    const created = createTileStreamSubsystem<ImageBitmap>({
      device,
      requestRender,
      atlasSide: SURFACE_TILE_ATLAS_SIDE,
      slotSide: tilePx,
      format: ATLAS_FORMAT,
      label: 'surface-tiles-albedo',
      concurrency: SURFACE_TILE_CONCURRENCY,
      upload: uploadBitmapToAtlas,
      release: closeBitmap,
    });
    // Post count and the Terrain-RGB format are compiled constants, not manifest fields
    // (spec §5.2), so the height atlas's geometry never depends on the bake.
    const createdHeight = createTileStreamSubsystem<HeightTileImage>({
      device,
      requestRender,
      atlasSide: HEIGHT_TILE_ATLAS_SIDE,
      slotSide: HEIGHT_POSTS_PER_TILE,
      format: HEIGHT_ATLAS_FORMAT,
      label: 'surface-tiles-height',
      concurrency: SURFACE_TILE_CONCURRENCY,
      upload: (heightAtlas, slotIdx, image) =>
        uploadBitmapToAtlas(heightAtlas, slotIdx, image.bitmap),
      release: (image) => closeBitmap(image.bitmap),
    });
    // Recycled slot; drop so `residentSlot` stays a pure projection of residency.
    created.setEvictHandler((key) => resident.delete(key));
    createdHeight.setEvictHandler((key) => heightResident.delete(key));
    atlas = { stream: created, heightStream: createdHeight, slotsPerRow, bodyId };
    return atlas;
  }

  /** Tear down the engaged body's atlas and residency (§ one engaged) —
   *  everything `destroy()` also clears EXCEPT the manifest/params state,
   *  which by the time a body switch is detected already belongs to the
   *  NEW body (`plannerParams` runs earlier in the same frame). */
  function standDown(): void {
    atlas?.stream.destroy();
    atlas?.heightStream.destroy();
    atlas = null;
    resident.clear();
    heightResident.clear();
    pendingLevelOf.clear();
    lastEngaged = null;
  }

  function update(input: { readonly bodyId: BodyId; readonly plan: SurfaceTilePlan }): void {
    if (destroyed) return;
    const { bodyId, plan } = input;
    // A different body than the one currently engaged (§ one engaged) —
    // its atlas and residency describe the WRONG body's tiles now.
    if (atlas !== null && atlas.bodyId !== bodyId) standDown();

    const active = paramsState?.bodyId === bodyId ? paramsState.params : null;
    // `refreshParams` is the sole writer of `paramsState`, and only ever
    // derives params from a non-null manifest — reasserting it here keeps
    // the tile prefix a read of the manifest rather than a second copy that
    // could go stale.
    if (active === null || manifest === null || manifestBodyId !== bodyId) return;
    const prefix = manifest.prefix;

    if (!(plan.zWin > active.baseLevel)) {
      lastEngaged = null;
      return;
    }

    const streams = atlas ?? engage(active.tilePx, bodyId);

    frameCounter++;

    // Requests arrive largest-on-screen-first: decides slot priority AND fetch
    // order. Two passes, not one: a single allocating pass let a new,
    // higher-priority request evict a resident this same plan would have
    // touched moments later — it still carried last frame's LRU stamp, so it
    // looked stale (and losing its pixels cascaded into evicting the next
    // untouched one). Pass 1 stamps every resident first; only genuine misses
    // reach pass 2's allocator.
    const misses: SurfaceTileRequest[] = [];
    // Debug-only tally: planned tiles whose payload hasn't landed yet,
    // whatever the atlas's own slot state — see `SurfaceTileDebugSnapshot`.
    // BOTH products: a stream stalled in only one of them would otherwise
    // read as zero misses, since neither gates refinement any more (R14).
    let notResidentCount = 0;
    for (const request of plan.requests) {
      const key = surfaceTilePath(request.tile, prefix);
      const isHeight = request.tile.product === 'height';
      const stream = isHeight ? streams.heightStream : streams.stream;
      if (!(isHeight ? heightResident : resident).has(key)) notResidentCount++;
      // Checked BEFORE touching: a touched failed key would keep its LRU
      // stamp fresh forever, pinning slots on tiles with no pixels.
      if (stream.isFailed(key)) continue;
      if (stream.touch(key, frameCounter) === null) misses.push(request);
    }

    let droppedAllocations = 0;
    for (const request of misses) {
      const key = surfaceTilePath(request.tile, prefix);
      const isHeight = request.tile.product === 'height';

      // Null means the atlas is already full this frame.
      if ((isHeight ? streams.heightStream : streams.stream).allocate(key, frameCounter) === null) {
        droppedAllocations++;
        continue;
      }

      if (isHeight) {
        streams.heightStream.enqueueFetch({
          key,
          priority: request.screenPx,
          fetcher: () => fetchHeightTile(request.tile, prefix),
          onResult: (image) => {
            // A destroyed subsystem destroyed its stream first, which releases.
            if (destroyed || image === null) return;
            const slot = streams.heightStream.upload(key, image);
            if (slot === null) return;
            // `readyAtMs` is the albedo crossfade's clock; height has no fade
            // (R14's ancestor fallback makes one tile's stamp meaningless), but
            // the residency record is shared, so it is stamped the same way.
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
        // Highest-priority-first queue.
        priority: request.screenPx,
        fetcher: () => fetchSurfaceTileBitmap(request.tile, prefix),
        onResult: (bitmap) => {
          if (destroyed || bitmap === null) {
            pendingLevelOf.delete(key);
            bitmap?.close();
            return;
          }
          // Resolved from the key now, not carried: may have been evicted
          // mid-flight. `upload` closes `bitmap` either way (uploaded or
          // recycled) — see `uploadBitmapToAtlas`/`closeBitmap`.
          const slot = streams.stream.upload(key, bitmap);
          // Stamped here, at the upload site — REAL time (`performance.now()`,
          // never sim time), so `surfaceTileRenderer`'s crossfade runs
          // even while the sim clock is paused or scaled.
          const readyAtMs = performance.now();
          pendingLevelOf.delete(key);
          if (slot === null) return;
          resident.set(key, {
            tile: request.tile,
            slot,
            readyAtMs,
            subtreeRangeM: null,
            gridCodes: null,
          });
        },
      });
    }

    lastEngaged = {
      plan: { requestCount: plan.requests.length, zWin: plan.zWin, misses: notResidentCount },
      droppedAllocations,
      subCameraDirLocal: plan.subCameraDirLocal,
    };
  }

  /**
   * Resolve one exact tile's atlas residency — the callback `cutSurfaceTiles`
   * walks ancestors through. Reuses `TextureAtlas.slotUv` (via the stream's
   * own `slotUv`) rather than re-deriving the slot-rect math.
   */
  function residentSlot(tile: SurfaceTileId): {
    slot: number;
    atlasUvOrigin: readonly [number, number];
    atlasUvScale: readonly [number, number];
    readyAtMs: number;
    subtreeRangeM: readonly [number, number] | null;
  } | null {
    if (manifest === null || atlas === null) return null;
    const key = surfaceTilePath(tile, manifest.prefix);
    const isHeight = tile.product === 'height';
    const entry = (isHeight ? heightResident : resident).get(key);
    if (entry === undefined) return null;
    const stream = isHeight ? atlas.heightStream : atlas.stream;
    const [u0, v0, u1, v1] = stream.slotUv(entry.slot);
    return {
      slot: entry.slot,
      atlasUvOrigin: [u0, v0],
      atlasUvScale: [u1 - u0, v1 - v0],
      readyAtMs: entry.readyAtMs,
      subtreeRangeM: entry.subtreeRangeM,
    };
  }

  /**
   * `terrainHeightM` composed with this subsystem's own residency (F3a).
   * `0` for any `bodyId` other than the engaged atlas's own — ONE-ENGAGED
   * (§ file header) means a stale or wrong-body query has no other body's
   * tiles to fall back to, so it must miss rather than read this one's.
   */
  function terrainHeightAt(bodyId: BodyId, dirBodyFixed: Vec3): number {
    if (atlas === null || atlas.bodyId !== bodyId) return 0;
    if (
      manifest === null ||
      manifestBodyId !== bodyId ||
      paramsState === null ||
      paramsState.bodyId !== bodyId ||
      paramsState.params === null
    ) {
      return 0;
    }
    const prefix = manifest.prefix;
    const { baseLevel, params } = paramsState;
    // No band covers this direction → nothing deeper than the whole-globe
    // base is ever baked there, so the climb below correctly finds nothing.
    const deepestLevel =
      deepestBandLevelAt(params.bands, directionToLonLatDeg(dirBodyFixed)) ?? baseLevel;
    return terrainHeightM(dirBodyFixed, deepestLevel, baseLevel, (tile) => {
      const entry = heightResident.get(surfaceTilePath(tile, prefix));
      if (entry === undefined || entry.gridCodes === null) return null;
      return { gridCodes: entry.gridCodes };
    });
  }

  function isAnimating(): boolean {
    if (manifestPending) return true;
    if (atlas === null) return false;
    return atlas.stream.inFlightCount() > 0 || atlas.heightStream.inFlightCount() > 0;
  }

  /** See `SurfaceTileDebugSnapshot`. Built on demand for a low-rate DebugPanel
   *  poll — never called from a render path, so an O(resident) scan is fine. */
  function getDebugSnapshot(): SurfaceTileDebugSnapshot {
    if (atlas === null) return EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT;

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

    // `paramsState.params` (the last request's bands) is set together with
    // `lastEngaged` by `refreshParams`/`update`.
    let subCamera: SurfaceTileDebugSnapshot['subCamera'] = null;
    if (lastEngaged !== null && paramsState !== null && paramsState.params !== null) {
      const lonLat = directionToLonLatDeg(lastEngaged.subCameraDirLocal);
      subCamera = {
        ...lonLat,
        coveredMaxLevel: deepestBandLevelAt(paramsState.params.bands, lonLat),
      };
    }

    // `cutCount` reads `lastCut` here, at snapshot-build time, rather than
    // being folded into `lastEngaged.plan` at `update()` time: `setLastCut`
    // runs AFTER `update()` in `runFrame`'s tile-planning block, so an
    // update()-time read would report the PREVIOUS frame's cut size.
    const plan = lastEngaged === null ? null : { ...lastEngaged.plan, cutCount: lastCut.length };

    return {
      engaged: true,
      // Only reachable via `engage()`, called from `update()` after
      // `plannerParams` already matched `bodyId` against a registry row —
      // narrower than `BodyId` for real, not just by assertion.
      bodyId: atlas.bodyId as SurfaceTileBodyId,
      capacity: atlas.slotsPerRow * atlas.slotsPerRow,
      used: atlas.stream.occupiedCount(),
      height: {
        used: atlas.heightStream.occupiedCount(),
        capacity: HEIGHT_ATLAS_SLOTS_PER_ROW * HEIGHT_ATLAS_SLOTS_PER_ROW,
      },
      levels,
      plan,
      droppedAllocations: lastEngaged?.droppedAllocations ?? 0,
      deepestLevelKeys,
      subCamera,
    };
  }

  function destroy(): void {
    destroyed = true;
    standDown();
    manifestBodyId = null;
    manifestPending = false;
    manifest = null;
    paramsState = null;
    lastCut = [];
  }

  const subsystem: SurfaceTileSubsystem = {
    plannerParams,
    update,
    residentSlot,
    terrainHeightAt,
    setLastCut: (cut) => {
      lastCut = cut;
    },
    getLastCut: () => lastCut,
    getAtlasView: () => atlas?.stream.getTextureView() ?? null,
    getHeightAtlasView: () => atlas?.heightStream.getTextureView() ?? null,
    isAnimating,
    getDebugSnapshot,
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
