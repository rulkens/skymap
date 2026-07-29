/**
 * earthTileSubsystem — the residency half of Earth's surface virtual texture.
 *
 * The feature splits cleanly in three and this file is the middle one. Above it,
 * `planEarthTiles` decides which tiles the frame wants and where the page-table
 * window sits; it is pure, and it is where every test lives. Below it,
 * `bitmapStreamSubsystem` owns the atlas texture, the LRU clock, the bounded
 * fetch queue and the ready/failed memoisation, none of which knows what it is
 * streaming. What is left in the middle is exactly this: turn a plan into
 * allocations and fetches, keep an arrival stamp per landed tile so the fade has
 * a start time, and project whatever is currently resident into the page table
 * the fragment reads. Every line of it touches a GPU, a network or a clock, which
 * is why it carries no unit test — the arithmetic it calls is covered in full one
 * layer up.
 *
 * ## Lazy, because the atlas is 67 MB
 *
 * Construction allocates nothing. The atlas and the page-table texture are
 * created by the first `update()`, which the drive site only calls once the
 * planner says the base texture has started magnifying. A session that never
 * leaves the outer solar system pays for none of it, and `getTileResources()`
 * returning null is the state the renderer draws in until then — which it must
 * be able to do anyway, since a bind-group layout is fixed at pipeline creation
 * and cannot wait for an atlas.
 *
 * ## The page table is rebuilt whole, every time, and never patched
 *
 * `buildEarthPageTable` is a pure projection of the resident set, and this file
 * keeps it that way: on any change it re-derives all 64 KB and uploads the lot.
 * Patching the cells that changed is the tempting alternative and it is precisely
 * the project's recorded "eviction granularity must match slot granularity"
 * landmine — a texel naming a slot that has since been recycled under a different
 * tile. Rebuilding makes that unreachable rather than merely unlikely: no texel
 * survives a rebuild. The window is what makes it affordable; see
 * `EarthTilePlan`.
 *
 * ## One map, not three
 *
 * Residency here is a single `Map<key, { tile, slot, readyMs }>`. The stream
 * subsystem below already owns "did the fetch land or fail?" as set membership;
 * what this layer adds is "which tile is in which slot, and when did it arrive",
 * and those three facts are written together by one event (an upload) and dropped
 * together by another (an eviction). Splitting them into a slot map plus a
 * parallel arrival-time map — the shape the galaxy path grew historically — would
 * be two things that must agree, and `EarthResidentTile` is shaped the way it is
 * precisely so the page-table builder can read them as one.
 */

import type { EarthTileId } from '../../../@types/data/EarthTileId';
import type { EarthTileKind } from '../../../@types/data/EarthTileKind';
import type { EarthTileManifest } from '../../../@types/scene/EarthTileManifest';
import type { EarthResidentTile } from '../../../@types/scene/EarthResidentTile';
import type { EarthTilePlan } from '../../../@types/scene/EarthTilePlan';
import type { EarthTilePlannerParams } from '../../../@types/scene/EarthTilePlannerParams';
import type { EarthTileSubsystem } from '../../../@types/engine/subsystems/EarthTileSubsystem';
import type { BitmapStreamSubsystem } from '../../../@types/engine/subsystems/BitmapStreamSubsystem';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import { createBitmapStreamSubsystem } from './bitmapStreamSubsystem';
import { buildEarthPageTable } from '../../../utils/scene/buildEarthPageTable';
import { earthTilePath } from '../../../utils/scene/earthTilePath';
import { fetchEarthTileManifest } from '../../../utils/scene/fetchEarthTileManifest';
import { fetchEarthTileBitmap } from '../../../utils/network/fetchEarthTileBitmap';
import { loadFadeAlpha } from '../../../utils/render/disk/loadFadeAlpha';
import {
  EARTH_TILE_ATLAS_SIDE,
  EARTH_TILE_BASE_LEVEL,
  EARTH_TILE_CONCURRENCY,
  EARTH_TILE_FADE_MS,
  EARTH_TILE_MIN_LEVEL,
  EARTH_TILE_PX,
  EARTH_TILE_WINDOW_SIDE,
} from '../../../data/bodies/earthTileParams';

/**
 * The one kind this subsystem pages. Whether relief is tiled too is the spec's
 * Q1, deliberately left to a look judgement made on the working build: answering
 * "yes" means a SECOND instance of this file's machinery, not a branch inside it,
 * because the two kinds have different deepest levels, independently planned
 * residency, and — the part that cannot be folded — different pixel formats. A
 * normal-map atlas must be `rgba8unorm`, never `-srgb`, and `isLinearTextureKind`
 * is already the single home for that distinction; the day this becomes a
 * constructor argument, the format must come from there and not from a second
 * literal.
 */
const TILED_KIND: EarthTileKind = 'surface';

const ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';

/** One atlas-resident tile: which tile, which slot, when its bitmap landed. */
type ResidentTile = {
  readonly tile: EarthTileId;
  readonly slot: number;
  readonly readyMs: number;
};

export type EarthTileDeps = {
  readonly device: GPUDevice;
  /**
   * Wake the engine's render loop for the next frame. Passed straight through to
   * the stream subsystem, which calls it when a tile lands or fails. This file
   * never calls it: everything else it knows about is surfaced through
   * `isAnimating()` for the keep-ticking predicate to read.
   */
  readonly requestRender: () => void;
};

export function createEarthTileSubsystem(deps: EarthTileDeps): EarthTileSubsystem {
  const { device, requestRender } = deps;

  // ── Manifest ────────────────────────────────────────────────────────────
  //
  // Fetched once, on the first `plannerParams()` call. That is earlier than
  // "when the virtual texture engages" and deliberately so: the engage rule is
  // `plan.zWin > baseLevel`, `zWin` only exists once the planner has run, and the
  // planner cannot run without the manifest's tile edge and level range. A fetch
  // that waited for engagement would be waiting on its own answer. One small JSON,
  // once per session, and nothing GPU-side rides on it.
  let manifestRequested = false;
  let manifestPending = false;
  let params: EarthTilePlannerParams | null = null;

  // ── Lazily-allocated GPU state ──────────────────────────────────────────
  let stream: BitmapStreamSubsystem | null = null;
  let pageTable: GPUTexture | null = null;
  let resources: { readonly pageTable: GPUTextureView; readonly atlas: GPUTextureView } | null =
    null;
  let slotsPerRow = 0;

  const resident = new Map<string, ResidentTile>();

  let frameCounter = 0;
  // The last frame's stamped clock, so the arrival callback and `isAnimating()`
  // read the frame clock rather than sampling `performance.now()` themselves.
  // At most one frame stale, which is nothing against a 400 ms fade, and it keeps
  // the fade deterministic under a stepped recorder clock.
  let lastFrameNowMs = 0;
  // Set by an arrival or an eviction; cleared by an upload. The window moving and
  // a fade still ramping are the other two reasons to rebuild, and both are read
  // rather than flagged because they are properties of the current frame.
  let residencyDirty = false;
  // The window the page table IN GPU MEMORY was built against — not the latest
  // plan's. Written only by `uploadPageTable`, so it and the texture's contents
  // are always the same age. That pairing is what the fragment's cell arithmetic
  // depends on, and it is why this is surfaced through its own accessor rather
  // than read off the plan at the draw site (see `getUploadedWindow`).
  let uploadedWindow: {
    readonly zWin: number;
    readonly winX0: number;
    readonly winY0: number;
  } | null = null;

  let destroyed = false;

  /**
   * Turn a fetched manifest into planner inputs, or null if the bake it describes
   * is one this build cannot address. Every rejection degrades the feature to
   * base-only, which is the identity case and the same picture Earth draws with
   * no manifest at all — so a refusal costs a reader nothing to reason about,
   * while the alternative (adapting) would be silently wrong pixels.
   *
   * ## Why a differently-cut pyramid is REFUSED and not adapted to
   *
   * 512 is a property of the tile FORMAT, not a parameter that flows. The
   * fragment derives the window level's column count from `zWin` alone
   * (`cols = 1u << zWin`), which is the ladder's `(EARTH_EQUIRECT_BASE_WIDTH_PX
   * << z) / tilePx` with the two 512s cancelled — an identity that holds at this
   * tile edge and at no other. Nothing on the GPU side reads `tilePx`, so a
   * pyramid cut at a different edge is not something the runtime can adapt to: it
   * would resolve the same uv to a different cell, and every cell in the window
   * would name the wrong ground with no error anywhere. Hence the manifest's
   * `tilePx` is a validated ASSERTION rather than an input — absent means "the
   * format's edge", present-and-different means "not this format". A re-bake at
   * another edge is a format change, and the format's version is the tile tree
   * itself.
   */
  function derivePlannerParams(manifest: EarthTileManifest): EarthTilePlannerParams | null {
    const levels = manifest.levels?.[TILED_KIND];
    if (!levels) return null;
    const tilePx = manifest.tilePx ?? EARTH_TILE_PX;
    if (tilePx !== EARTH_TILE_PX) return null;
    // The base level IS the whole-globe base texture, so the request floor holds
    // even if a bake emitted shallower levels — fetching one would re-download an
    // image already bound.
    const minTileLevel = Math.max(EARTH_TILE_MIN_LEVEL, levels.min);
    if (!(levels.max >= minTileLevel)) return null;
    return {
      kind: TILED_KIND,
      tilePx,
      baseLevel: EARTH_TILE_BASE_LEVEL,
      minTileLevel,
      maxTileLevel: levels.max,
      windowSide: EARTH_TILE_WINDOW_SIDE,
    };
  }

  function plannerParams(): EarthTilePlannerParams | null {
    if (!manifestRequested) {
      manifestRequested = true;
      manifestPending = true;
      void fetchEarthTileManifest().then((manifest) => {
        manifestPending = false;
        if (destroyed || manifest === null) return;
        params = derivePlannerParams(manifest);
      });
    }
    return params;
  }

  /**
   * Allocate the atlas and the page table. Called by the first engaged frame and
   * never again — `slotSide` comes from the manifest's tile edge rather than a
   * literal, so a re-bake at a different edge stays a data change.
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
      // The atlas has recycled this slot under another tile, so the entry
      // describing it is now a lie. Dropping it is what keeps the page table a
      // pure projection of what is actually in the atlas.
      if (resident.delete(key)) residencyDirty = true;
    });

    pageTable = device.createTexture({
      label: `earth-${TILED_KIND}-page-table`,
      size: [EARTH_TILE_WINDOW_SIDE, EARTH_TILE_WINDOW_SIDE, 1],
      // Integer channels, read with `textureLoad`: the four values are a slot
      // column, a slot row, a level and a blend weight, none of which wants
      // filtering or normalising on the way in.
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

  function isFading(nowMs: number): boolean {
    for (const entry of resident.values()) {
      if (nowMs - entry.readyMs < EARTH_TILE_FADE_MS) return true;
    }
    return false;
  }

  function uploadPageTable(plan: EarthTilePlan, tilePx: number, nowMs: number): void {
    if (pageTable === null) return;
    const projected: EarthResidentTile[] = [];
    for (const entry of resident.values()) {
      projected.push({
        tile: entry.tile,
        slot: entry.slot,
        weight: loadFadeAlpha(entry.readyMs, nowMs, EARTH_TILE_FADE_MS),
      });
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
    uploadedWindow = { zWin: plan.zWin, winX0: plan.winX0, winY0: plan.winY0 };
  }

  function update(input: { readonly plan: EarthTilePlan; readonly nowMs: number }): void {
    if (destroyed) return;
    const active = params;
    // Only reachable if the drive site called `update` before `plannerParams`
    // answered; there is nothing to plan against, so there is nothing to do.
    if (active === null) return;

    const { plan, nowMs } = input;
    lastFrameNowMs = nowMs;
    const atlas = stream ?? engage(active.tilePx);

    frameCounter++;

    // Requests arrive largest-on-screen-first from the planner, and that order is
    // load-bearing twice over: it is the order slots are claimed in when the atlas
    // is over-subscribed, and it is the order the queue pops in.
    for (const request of plan.requests) {
      const key = earthTilePath(request.tile);

      // Checked BEFORE allocating, unlike the galaxy thumbnail path. A land-only
      // pyramid means most of the grid legitimately 404s, and a failed key that
      // kept being allocated would hold a slot AND keep its LRU stamp fresh
      // forever — a descent over ocean could pin all 64 slots on tiles that will
      // never have pixels. Skipping the allocation lets the slot go stale and be
      // recycled, and the stream subsystem's failure memoisation is what stops
      // the retry storm in the meantime.
      if (atlas.isFailed(key)) continue;

      const slot = atlas.allocate(key, frameCounter);
      if (slot === null) continue;
      if (atlas.isLoaded(key)) continue;

      atlas.enqueueFetch({
        key,
        // The queue pops highest-priority first, so the projected on-screen extent
        // goes in unnegated: the tile covering most of the screen loads first.
        priority: request.screenPx,
        fetcher: () => fetchEarthTileBitmap(request.tile),
        onResult: (bitmap) => {
          if (destroyed || bitmap === null) {
            bitmap?.close();
            return;
          }
          // The slot may have been recycled under another tile during the round
          // trip; uploading into it now would paint this tile's pixels under
          // someone else's page-table entry.
          if (atlas.lastSeenFrame(key) === undefined) {
            bitmap.close();
            return;
          }
          atlas.uploadBitmap(slot, bitmap);
          bitmap.close();
          resident.set(key, { tile: request.tile, slot, readyMs: lastFrameNowMs });
          residencyDirty = true;
        },
      });
    }

    const windowMoved =
      uploadedWindow === null ||
      uploadedWindow.zWin !== plan.zWin ||
      uploadedWindow.winX0 !== plan.winX0 ||
      uploadedWindow.winY0 !== plan.winY0;
    // A fade in progress means the weights differ from the ones last uploaded, so
    // the table is rebuilt every frame until the last arrival has ramped out. That
    // is also what carries the fade visually: nothing else changes during it.
    if (residencyDirty || windowMoved || isFading(nowMs)) {
      uploadPageTable(plan, active.tilePx, nowMs);
    }
  }

  function isAnimating(): boolean {
    if (manifestPending) return true;
    if (stream !== null && stream.inFlightCount() > 0) return true;
    return isFading(lastFrameNowMs);
  }

  function destroy(): void {
    destroyed = true;
    stream?.destroy();
    stream = null;
    pageTable?.destroy();
    pageTable = null;
    resources = null;
    resident.clear();
    params = null;
    uploadedWindow = null;
  }

  const subsystem: EarthTileSubsystem = {
    plannerParams,
    update,
    getTileResources: () => resources,
    getUploadedWindow: () => uploadedWindow,
    isAnimating,
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
