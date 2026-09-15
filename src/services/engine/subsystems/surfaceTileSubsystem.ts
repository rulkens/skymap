/**
 * surfaceTileSubsystem — the residency half of one body's surface virtual
 * texture, registry-driven and ONE-ENGAGED (`SURFACE_TILE_REGISTRY`).
 * `cutSurfaceTiles` (pure, tested) decides which tiles a frame wants and
 * resolves each visible leaf's atlas residency; `bitmapStreamSubsystem` owns
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
import type { EarthTileKind } from '../../../@types/data/EarthTileKind';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { SurfaceTileSpec } from '../../../@types/data/SurfaceTileSpec';
import type { SurfaceTileManifest } from '../../../@types/scene/SurfaceTileManifest';
import type { SurfaceTileBand } from '../../../@types/scene/SurfaceTileBand';
import type { SurfaceTilePlan } from '../../../@types/scene/SurfaceTilePlan';
import type { SurfaceTilePlannerParams } from '../../../@types/scene/SurfaceTilePlannerParams';
import type { SurfaceTileRequest } from '../../../@types/scene/SurfaceTileRequest';
import type { SurfaceTileDebugSnapshot } from '../../../@types/scene/SurfaceTileDebugSnapshot';
import type { SurfaceCutTile } from '../../../@types/scene/SurfaceCutTile';
import type { SurfaceTileSubsystem } from '../../../@types/engine/subsystems/SurfaceTileSubsystem';
import type { BitmapStreamSubsystem } from '../../../@types/engine/subsystems/BitmapStreamSubsystem';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { Vec3 } from '../../../@types/math/Vec3';
import { createBitmapStreamSubsystem } from './bitmapStreamSubsystem';
import { SURFACE_TILE_REGISTRY } from '../../../data/bodies/surfaceTileRegistry';
import { surfaceTilePath } from '../../../utils/scene/surfaceTilePath';
import { fetchSurfaceTileManifest } from '../../../utils/scene/fetchSurfaceTileManifest';
import { fetchSurfaceTileBitmap } from '../../../utils/network/fetchSurfaceTileBitmap';
import { directionToLonLatDeg } from '../../../utils/scene/directionToLonLatDeg';
import { deepestBandLevelAt } from '../../../utils/scene/deepestBandLevelAt';
import {
  EARTH_TILE_ATLAS_SIDE,
  EARTH_TILE_CONCURRENCY,
  EARTH_TILE_LOD_BIAS,
  EARTH_TILE_PX,
} from '../../../data/bodies/earthTileParams';

// The one kind this subsystem pages today; tiling relief too would need a
// second instance of this machinery, not a branch inside it (different
// deepest levels, independent residency, a different pixel format).
const TILED_KIND: EarthTileKind = 'surface';

const ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';

/** The "nothing here yet" snapshot — atlas never allocated, or `state.subsystems.surfaceTiles`
 *  itself is null. Exported so `engine.ts`'s debug handle shares this shape instead of
 *  restating it. */
export const EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT: SurfaceTileDebugSnapshot = {
  engaged: false,
  capacity: 0,
  used: 0,
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
    readonly stream: BitmapStreamSubsystem;
    readonly slotsPerRow: number;
    readonly bodyId: BodyId;
  } | null = null;

  const resident = new Map<string, ResidentTile>();
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
   * `EARTH_TILE_ATLAS_SIDE / tilePx` alone, an identity that holds only at
   * the shipped 512 px edge. `baseLevel` arrives already resolved — WHICH
   * function turns a tier into a level is body-specific (`earthBaseLevelForTier`
   * today), so this generic subsystem no longer calls one itself.
   */
  function derivePlannerParams(
    fetched: SurfaceTileManifest,
    baseLevel: number,
  ): SurfaceTilePlannerParams | null {
    const levels = fetched.levels?.[TILED_KIND];
    if (!levels || levels.length === 0) return null;
    const tilePx = fetched.tilePx ?? EARTH_TILE_PX;
    if (tilePx !== EARTH_TILE_PX) return null;
    const bands: SurfaceTileBand[] = [];
    for (const level of levels) {
      // A structurally-wrong manifest entry (missing/malformed `bounds`)
      // degrades by skipping it, matching this function's whole stance —
      // never throw out of `refreshParams` over one bad band.
      if (typeof level?.bounds?.west !== 'number') continue;
      // Deeper of the band's own min and base+1: at/above base would
      // re-download detail the whole-globe base already delivers.
      const min = Math.max(level.min, baseLevel + 1);
      // A band clamped past its own depth at this base level bakes nothing usable.
      if (!(level.max >= min)) continue;
      bands.push({
        uBounds: [(level.bounds.west + 180) / 360, (level.bounds.east + 180) / 360],
        // South-first: matches the mesh's v (v = 0 at the south pole).
        vBounds: [(level.bounds.south + 90) / 180, (level.bounds.north + 90) / 180],
        min,
        max: level.max,
      });
    }
    if (bands.length === 0) return null;
    return {
      kind: TILED_KIND,
      tilePx,
      baseLevel,
      bands,
      lodBias: EARTH_TILE_LOD_BIAS,
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
  function engage(tilePx: number, bodyId: BodyId): BitmapStreamSubsystem {
    const slotsPerRow = EARTH_TILE_ATLAS_SIDE / tilePx;
    const created = createBitmapStreamSubsystem({
      device,
      requestRender,
      atlasSide: EARTH_TILE_ATLAS_SIDE,
      slotSide: tilePx,
      format: ATLAS_FORMAT,
      label: `earth-${TILED_KIND}-tiles`,
      concurrency: EARTH_TILE_CONCURRENCY,
    });
    // Recycled slot; drop so `residentSlot` stays a pure projection of residency.
    created.setEvictHandler((key) => resident.delete(key));
    atlas = { stream: created, slotsPerRow, bodyId };
    return created;
  }

  /** Tear down the engaged body's atlas and residency (§ one engaged) —
   *  everything `destroy()` also clears EXCEPT the manifest/params state,
   *  which by the time a body switch is detected already belongs to the
   *  NEW body (`plannerParams` runs earlier in the same frame). */
  function standDown(): void {
    atlas?.stream.destroy();
    atlas = null;
    resident.clear();
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

    const stream = atlas?.stream ?? engage(active.tilePx, bodyId);

    frameCounter++;

    // Requests arrive largest-on-screen-first: decides slot priority AND fetch
    // order. Two passes, not one: a single allocating pass let a new,
    // higher-priority request evict a resident this same plan would have
    // touched moments later — it still carried last frame's LRU stamp, so it
    // looked stale (and losing its pixels cascaded into evicting the next
    // untouched one). Pass 1 stamps every resident first; only genuine misses
    // reach pass 2's allocator.
    const misses: SurfaceTileRequest[] = [];
    // Debug-only tally: planned tiles whose bitmap hasn't landed in `resident`
    // yet, whatever the atlas's own slot state — see `SurfaceTileDebugSnapshot`.
    let notResidentCount = 0;
    for (const request of plan.requests) {
      const key = surfaceTilePath(request.tile, prefix);
      if (!resident.has(key)) notResidentCount++;
      // Checked BEFORE touching: a touched failed key would keep its LRU
      // stamp fresh forever, pinning slots on tiles with no pixels.
      if (stream.isFailed(key)) continue;
      if (stream.touch(key, frameCounter) === null) misses.push(request);
    }

    let droppedAllocations = 0;
    for (const request of misses) {
      const key = surfaceTilePath(request.tile, prefix);

      // Null means the atlas is already full this frame.
      if (stream.allocate(key, frameCounter) === null) {
        droppedAllocations++;
        continue;
      }

      pendingLevelOf.set(key, request.tile.z);
      stream.enqueueFetch({
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
          // Resolved from the key now, not carried: may have been evicted mid-flight.
          const slot = stream.uploadBitmap(key, bitmap);
          // Stamped here, at the upload site — REAL time (`performance.now()`,
          // never sim time), so `earthSurfaceTileRenderer`'s crossfade runs
          // even while the sim clock is paused or scaled.
          const readyAtMs = performance.now();
          pendingLevelOf.delete(key);
          bitmap.close();
          if (slot === null) return;
          resident.set(key, { tile: request.tile, slot, readyAtMs });
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
  } | null {
    if (manifest === null || atlas === null) return null;
    const key = surfaceTilePath(tile, manifest.prefix);
    const entry = resident.get(key);
    if (entry === undefined) return null;
    const [u0, v0, u1, v1] = atlas.stream.slotUv(entry.slot);
    return {
      slot: entry.slot,
      atlasUvOrigin: [u0, v0],
      atlasUvScale: [u1 - u0, v1 - v0],
      readyAtMs: entry.readyAtMs,
    };
  }

  function isAnimating(): boolean {
    if (manifestPending) return true;
    return atlas !== null && atlas.stream.inFlightCount() > 0;
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
      capacity: atlas.slotsPerRow * atlas.slotsPerRow,
      used: atlas.stream.occupiedCount(),
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
    setLastCut: (cut) => {
      lastCut = cut;
    },
    getLastCut: () => lastCut,
    getAtlasView: () => atlas?.stream.getTextureView() ?? null,
    isAnimating,
    getDebugSnapshot,
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
