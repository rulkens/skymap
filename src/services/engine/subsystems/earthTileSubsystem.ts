/**
 * earthTileSubsystem — the residency half of Earth's surface virtual texture.
 * `planEarthTiles` (pure, tested) decides which tiles a frame wants;
 * `bitmapStreamSubsystem` owns the atlas, LRU clock and fetch queue. This
 * file turns a plan into allocations and fetches, and projects whatever is
 * resident into the page table the fragment reads.
 *
 * `update()` owns both sides of engagement (`plan.zWin > baseLevel`), not
 * just a caller's `if` — a drive-site `if` once left a stale page table bound
 * after the camera pulled back out, painting ground from wherever it used to
 * be. Allocation is lazy: the 67 MB atlas and page table are created by the
 * first engaged `update()`. Standing down uploads an all-zero table and keeps
 * everything else resident, so a camera that returns finds its tiles intact.
 */

import type { EarthTileId } from '../../../@types/data/EarthTileId';
import type { EarthTileKind } from '../../../@types/data/EarthTileKind';
import type { Tier } from '../../../@types/data/Tier';
import type { EarthTileManifest } from '../../../@types/scene/EarthTileManifest';
import type { EarthResidentTile } from '../../../@types/scene/EarthResidentTile';
import type { EarthTileBand } from '../../../@types/scene/EarthTileBand';
import type { EarthTilePlan } from '../../../@types/scene/EarthTilePlan';
import type { EarthTilePlannerParams } from '../../../@types/scene/EarthTilePlannerParams';
import type { EarthTileRequest } from '../../../@types/scene/EarthTileRequest';
import type { EarthTileDebugSnapshot } from '../../../@types/scene/EarthTileDebugSnapshot';
import type { EarthTileSubsystem } from '../../../@types/engine/subsystems/EarthTileSubsystem';
import type { BitmapStreamSubsystem } from '../../../@types/engine/subsystems/BitmapStreamSubsystem';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { Vec3 } from '../../../@types/math/Vec3';
import { createBitmapStreamSubsystem } from './bitmapStreamSubsystem';
import { buildEarthPageTable } from '../../../utils/scene/buildEarthPageTable';
import { earthBaseLevelForTier } from '../../../utils/scene/earthBaseLevelForTier';
import { earthTilePath } from '../../../utils/scene/earthTilePath';
import { fetchEarthTileManifest } from '../../../utils/scene/fetchEarthTileManifest';
import { fetchEarthTileBitmap } from '../../../utils/network/fetchEarthTileBitmap';
import { loadFadeAlpha } from '../../../utils/render/disk/loadFadeAlpha';
import { directionToLonLatDeg } from '../../../utils/scene/directionToLonLatDeg';
import { deepestBandLevelAt } from '../../../utils/scene/deepestBandLevelAt';
import {
  EARTH_TILE_ATLAS_SIDE,
  EARTH_TILE_CONCURRENCY,
  EARTH_TILE_FADE_MS,
  EARTH_TILE_LOD_BIAS,
  EARTH_TILE_PX,
  EARTH_TILE_WINDOW_SIDE,
} from '../../../data/bodies/earthTileParams';

// The one kind this subsystem pages today; tiling relief too would need a
// second instance of this machinery, not a branch inside it (different
// deepest levels, independent residency, a different pixel format).
const TILED_KIND: EarthTileKind = 'surface';

const ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';

/** The "nothing here yet" snapshot — atlas never allocated, or `state.subsystems.earthTiles`
 *  itself is null. Exported so `engine.ts`'s debug handle shares this shape instead of
 *  restating it. */
export const EMPTY_EARTH_TILE_DEBUG_SNAPSHOT: EarthTileDebugSnapshot = {
  engaged: false,
  capacity: 0,
  used: 0,
  levels: [],
  plan: null,
  droppedAllocations: 0,
  deepestLevelKeys: [],
  subCamera: null,
};

/** One atlas-resident tile: which tile, which slot, when its bitmap landed. */
type ResidentTile = {
  readonly tile: EarthTileId;
  readonly slot: number;
  readonly readyMs: number;
};

export type EarthTileDeps = {
  readonly device: GPUDevice;
  /** Wakes the render loop; passed through to the stream subsystem. This file
   *  surfaces its own state through `isAnimating()` instead. */
  readonly requestRender: () => void;
};

export function createEarthTileSubsystem(deps: EarthTileDeps): EarthTileSubsystem {
  const { device, requestRender } = deps;

  // Fetched once, on the first `plannerParams()` call — earlier than
  // engagement, since the engage rule needs the manifest's `zWin`.
  let manifestRequested = false;
  let manifestPending = false;
  let manifest: EarthTileManifest | null = null;
  // Cached with the tier it was derived at, so a swap can't be answered stale.
  let params: EarthTilePlannerParams | null = null;
  let paramsTier: Tier | null = null;

  let stream: BitmapStreamSubsystem | null = null;
  let pageTable: GPUTexture | null = null;
  let resources: { readonly pageTable: GPUTextureView; readonly atlas: GPUTextureView } | null =
    null;
  let slotsPerRow = 0;

  const resident = new Map<string, ResidentTile>();
  // key -> z, for the debug snapshot's per-level pending counts. Written when a
  // fetch is enqueued; cleared in the same `onResult` branches that already
  // handle its resolution (declined or uploaded), so there's no third path to
  // keep in sync.
  const pendingLevelOf = new Map<string, number>();
  let lastPlan: EarthTileDebugSnapshot['plan'] = null;
  let lastDroppedAllocations = 0;
  // The direction the last engaged plan was computed around — same lifecycle
  // as `lastPlan` (set together, cleared together), so the debug snapshot's
  // sub-camera readout never outlives the plan it describes.
  let lastSubCameraDirLocal: Vec3 | null = null;

  let frameCounter = 0;
  // Frame's stamped clock, so `readyMs` stays deterministic under a stepped clock.
  let lastFrameNowMs = 0;
  let residencyDirty = false;
  // What the page table IN GPU MEMORY holds. `saturated` checks recorded
  // weights rather than the clock: `loadFadeAlpha` reaches 1 exactly on the
  // frame the fade completes, so a clock check would skip that frame's
  // rebuild and park the table just under full weight forever.
  let uploaded: {
    readonly window: {
      readonly zWin: number;
      readonly winX0: number;
      readonly winY0: number;
    };
    readonly saturated: boolean;
  } | null = null;

  let destroyed = false;

  /**
   * Turn a fetched manifest plus the bound tier into planner inputs, or null
   * if the bake is one this build cannot address — every rejection degrades
   * to base-only, cheaper to reason about than silently adapting to wrong
   * pixels. `tilePx` is a validated ASSERTION: the fragment derives the
   * window level's column count from `zWin` alone, an identity that holds
   * only at the shipped 512 px edge.
   */
  function derivePlannerParams(
    fetched: EarthTileManifest,
    tier: Tier,
  ): EarthTilePlannerParams | null {
    const levels = fetched.levels?.[TILED_KIND];
    if (!levels || levels.length === 0) return null;
    const tilePx = fetched.tilePx ?? EARTH_TILE_PX;
    if (tilePx !== EARTH_TILE_PX) return null;
    const baseLevel = earthBaseLevelForTier(tier);
    const bands: EarthTileBand[] = [];
    for (const level of levels) {
      // A structurally-wrong manifest entry (missing/malformed `bounds`)
      // degrades by skipping it, matching this function's whole stance —
      // never throw out of `refreshParams` over one bad band.
      if (typeof level?.bounds?.west !== 'number') continue;
      // Deeper of the band's own min and base+1: at/above base would
      // re-download detail the whole-globe base already delivers.
      const min = Math.max(level.min, baseLevel + 1);
      // A band clamped past its own depth at this tier bakes nothing usable.
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
      windowSide: EARTH_TILE_WINDOW_SIDE,
      lodBias: EARTH_TILE_LOD_BIAS,
    };
  }

  /** The one writer of the `(params, paramsTier)` pair, so the two can't
   *  describe different tiers. */
  function refreshParams(tier: Tier): void {
    paramsTier = tier;
    params = manifest === null ? null : derivePlannerParams(manifest, tier);
  }

  function plannerParams(tier: Tier): EarthTilePlannerParams | null {
    if (!manifestRequested) {
      manifestRequested = true;
      manifestPending = true;
      void fetchEarthTileManifest().then((fetched) => {
        manifestPending = false;
        if (destroyed || fetched === null) return;
        manifest = fetched;
        // Derived here so `update()` has params ready the same frame.
        refreshParams(paramsTier ?? tier);
      });
    }
    if (paramsTier !== tier) refreshParams(tier);
    return params;
  }

  /**
   * Allocate the atlas and the page table. Called by the first engaged frame
   * and never again — `slotSide` comes from the manifest's tile edge, so a
   * re-bake at a different edge stays a data change.
   */
  function engage(tilePx: number): BitmapStreamSubsystem {
    slotsPerRow = EARTH_TILE_ATLAS_SIDE / tilePx;
    const created = createBitmapStreamSubsystem({
      device,
      requestRender,
      atlasSide: EARTH_TILE_ATLAS_SIDE,
      slotSide: tilePx,
      format: ATLAS_FORMAT,
      label: `earth-${TILED_KIND}-tiles`,
      concurrency: EARTH_TILE_CONCURRENCY,
    });
    created.setEvictHandler((key) => {
      // Recycled slot; drop so the page table stays a pure projection of residency.
      if (resident.delete(key)) residencyDirty = true;
    });

    pageTable = device.createTexture({
      label: `earth-${TILED_KIND}-page-table`,
      size: [EARTH_TILE_WINDOW_SIDE, EARTH_TILE_WINDOW_SIDE, 1],
      // Integer channels: slot column, slot row, level, blend weight.
      format: 'rgba8uint',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    resources = {
      pageTable: pageTable.createView({ label: `earth-${TILED_KIND}-page-table-view` }),
      atlas: created.getTextureView(),
    };
    stream = created;
    return created;
  }

  /** Whether the table owes an upload unrelated to camera position: residency
   *  changed, or its weights are mid-fade (window movement is `update`'s own
   *  concern below). */
  function rebuildOwed(): boolean {
    return uploaded !== null && (residencyDirty || !uploaded.saturated);
  }

  function uploadPageTable(plan: EarthTilePlan, tilePx: number, nowMs: number): void {
    if (pageTable === null) return;
    const projected: EarthResidentTile[] = [];
    // An empty resident set is saturated vacuously: no fade left to finish.
    let saturated = true;
    for (const entry of resident.values()) {
      const weight = loadFadeAlpha(entry.readyMs, nowMs, EARTH_TILE_FADE_MS);
      if (weight < 1) saturated = false;
      projected.push({ tile: entry.tile, slot: entry.slot, weight });
    }
    const table = buildEarthPageTable({
      resident: projected,
      plan,
      slotsPerRow,
      windowSide: EARTH_TILE_WINDOW_SIDE,
      tilePx,
    });
    device.queue.writeTexture(
      { texture: pageTable },
      table,
      { bytesPerRow: EARTH_TILE_WINDOW_SIDE * 4, rowsPerImage: EARTH_TILE_WINDOW_SIDE },
      [EARTH_TILE_WINDOW_SIDE, EARTH_TILE_WINDOW_SIDE, 1],
    );
    residencyDirty = false;
    uploaded = {
      window: { zWin: plan.zWin, winX0: plan.winX0, winY0: plan.winY0 },
      saturated,
    };
  }

  /** Leave the virtual texture showing nothing, once, when the engage rule
   *  goes false. All-zero is the identity (alpha = blend weight); nothing is
   *  freed — the LRU handles real capacity pressure. */
  function standDown(): void {
    // Never allocated ⇒ nothing to stand down.
    if (pageTable === null || uploaded === null) return;
    device.queue.writeTexture(
      { texture: pageTable },
      new Uint8Array(EARTH_TILE_WINDOW_SIDE * EARTH_TILE_WINDOW_SIDE * 4),
      { bytesPerRow: EARTH_TILE_WINDOW_SIDE * 4, rowsPerImage: EARTH_TILE_WINDOW_SIDE },
      [EARTH_TILE_WINDOW_SIDE, EARTH_TILE_WINDOW_SIDE, 1],
    );
    // Re-arms the rebuild: the next engaged frame reads this as a moved window.
    uploaded = null;
  }

  function update(input: { readonly plan: EarthTilePlan; readonly nowMs: number }): void {
    if (destroyed) return;
    const active = params;
    // `refreshParams` is the sole writer of both, and only ever derives params
    // from a non-null manifest — reasserting it here keeps the tile prefix a
    // read of the manifest rather than a second copy that could go stale.
    if (active === null || manifest === null) return;
    const prefix = manifest.prefix;

    const { plan, nowMs } = input;
    // Stamped on disengaged frames too, so a landing tile still fades from now.
    lastFrameNowMs = nowMs;

    if (!(plan.zWin > active.baseLevel)) {
      // Disengaging: the last plan's shape stops being current information.
      lastPlan = null;
      lastDroppedAllocations = 0;
      lastSubCameraDirLocal = null;
      standDown();
      return;
    }

    const atlas = stream ?? engage(active.tilePx);

    frameCounter++;

    // Requests arrive largest-on-screen-first: decides slot priority AND fetch
    // order. Two passes, not one: a single allocating pass let a new,
    // higher-priority request evict a resident this same plan would have
    // touched moments later — it still carried last frame's LRU stamp, so it
    // looked stale (and losing its pixels cascaded into evicting the next
    // untouched one). Pass 1 stamps every resident first; only genuine misses
    // reach pass 2's allocator.
    const misses: EarthTileRequest[] = [];
    // Debug-only tally: planned tiles whose bitmap hasn't landed in `resident`
    // yet, whatever the atlas's own slot state — see `EarthTileDebugSnapshot`.
    let notResidentCount = 0;
    for (const request of plan.requests) {
      const key = earthTilePath(request.tile, prefix);
      if (!resident.has(key)) notResidentCount++;
      // Checked BEFORE touching: a touched failed key would keep its LRU
      // stamp fresh forever, pinning slots on tiles with no pixels.
      if (atlas.isFailed(key)) continue;
      if (atlas.touch(key, frameCounter) === null) misses.push(request);
    }

    let droppedAllocations = 0;
    for (const request of misses) {
      const key = earthTilePath(request.tile, prefix);

      // Null means the atlas is already full this frame.
      if (atlas.allocate(key, frameCounter) === null) {
        droppedAllocations++;
        continue;
      }

      pendingLevelOf.set(key, request.tile.z);
      atlas.enqueueFetch({
        key,
        // Highest-priority-first queue.
        priority: request.screenPx,
        fetcher: () => fetchEarthTileBitmap(request.tile, prefix),
        onResult: (bitmap) => {
          if (destroyed || bitmap === null) {
            pendingLevelOf.delete(key);
            bitmap?.close();
            return;
          }
          // Resolved from the key now, not carried: may have been evicted mid-flight.
          const slot = atlas.uploadBitmap(key, bitmap);
          pendingLevelOf.delete(key);
          bitmap.close();
          if (slot === null) return;
          resident.set(key, { tile: request.tile, slot, readyMs: lastFrameNowMs });
          residencyDirty = true;
        },
      });
    }

    lastPlan = { requestCount: plan.requests.length, zWin: plan.zWin, misses: notResidentCount };
    lastDroppedAllocations = droppedAllocations;
    lastSubCameraDirLocal = plan.subCameraDirLocal;

    const windowMoved =
      uploaded === null ||
      uploaded.window.zWin !== plan.zWin ||
      uploaded.window.winX0 !== plan.winX0 ||
      uploaded.window.winY0 !== plan.winY0;
    // Rebuilt every frame until the last arrival ramps to full weight.
    if (windowMoved || rebuildOwed()) {
      uploadPageTable(plan, active.tilePx, nowMs);
    }
  }

  function isAnimating(): boolean {
    if (manifestPending) return true;
    if (stream !== null && stream.inFlightCount() > 0) return true;
    return rebuildOwed();
  }

  /** See `EarthTileDebugSnapshot`. Built on demand for a low-rate DebugPanel
   *  poll — never called from a render path, so an O(resident) scan is fine. */
  function getDebugSnapshot(): EarthTileDebugSnapshot {
    if (stream === null) return EMPTY_EARTH_TILE_DEBUG_SNAPSHOT;

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

    // `lastSubCameraDirLocal` is null exactly while disengaged, and `params`
    // (the last tier's bands) is set together with it by `refreshParams`.
    let subCamera: EarthTileDebugSnapshot['subCamera'] = null;
    if (lastSubCameraDirLocal !== null && params !== null) {
      const lonLat = directionToLonLatDeg(lastSubCameraDirLocal);
      subCamera = { ...lonLat, coveredMaxLevel: deepestBandLevelAt(params.bands, lonLat) };
    }

    return {
      engaged: true,
      capacity: slotsPerRow * slotsPerRow,
      used: stream.occupiedCount(),
      levels,
      plan: lastPlan,
      droppedAllocations: lastDroppedAllocations,
      deepestLevelKeys,
      subCamera,
    };
  }

  function destroy(): void {
    destroyed = true;
    stream?.destroy();
    stream = null;
    pageTable?.destroy();
    pageTable = null;
    resources = null;
    resident.clear();
    pendingLevelOf.clear();
    lastPlan = null;
    lastDroppedAllocations = 0;
    lastSubCameraDirLocal = null;
    manifest = null;
    params = null;
    paramsTier = null;
    uploaded = null;
  }

  const subsystem: EarthTileSubsystem = {
    plannerParams,
    update,
    getTileResources: () => resources,
    getUploadedWindow: () => uploaded?.window ?? null,
    isAnimating,
    getDebugSnapshot,
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
