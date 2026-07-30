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
 * ## Engagement is a state of this subsystem, not a condition at the drive site
 *
 * `update()` runs on every frame Earth's layer draws, and the engage rule —
 * `plan.zWin > baseLevel`, "has the whole-globe base texture started magnifying
 * yet?" — is evaluated in here. It is read off the plan rather than re-derived
 * as an altitude threshold because the planner already decided which level the
 * screen's texel density calls for. The comparison is against `baseLevel` and
 * NOT against the shallowest baked level, which the plan's own floor satisfies
 * by construction; at or below the base there is nothing a tile could add.
 *
 * Siting the gate here rather than around the call is the whole point. As a
 * drive-site `if`, engaging is a thing the caller does and disengaging is a
 * thing that merely stops happening — an asymmetry that hides an entire missing
 * half, and did: a camera that pulled back out left the last uploaded page
 * table on the globe forever, painting ground from wherever it used to be.
 * Owning both sides in one function means the disengaged frame is a frame this
 * file sees, with somewhere to put the stand-down.
 *
 * ## Lazy, because the atlas is 67 MB
 *
 * Construction allocates nothing, and neither does a disengaged frame. The
 * atlas and the page-table texture are created by the first ENGAGED `update()`.
 * A session that never leaves the outer solar system pays for none of it, and
 * `getTileResources()` returning null is the state the renderer draws in until
 * then — which it must be able to do anyway, since a bind-group layout is fixed
 * at pipeline creation and cannot wait for an atlas.
 *
 * Standing down is therefore not the inverse of engaging: it uploads an
 * all-zero page table and stops, keeping the atlas, the resident map and the
 * bind group. A camera that pulls out and comes back finds its tiles still
 * there, the LRU handles genuine pressure, and the placeholder machinery stays
 * what it is — the pre-engage state, not a state to fall back into.
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
import type { Tier } from '../../../@types/data/Tier';
import type { EarthTileManifest } from '../../../@types/scene/EarthTileManifest';
import type { EarthResidentTile } from '../../../@types/scene/EarthResidentTile';
import type { EarthTilePlan } from '../../../@types/scene/EarthTilePlan';
import type { EarthTilePlannerParams } from '../../../@types/scene/EarthTilePlannerParams';
import type { EarthTileSubsystem } from '../../../@types/engine/subsystems/EarthTileSubsystem';
import type { BitmapStreamSubsystem } from '../../../@types/engine/subsystems/BitmapStreamSubsystem';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import { createBitmapStreamSubsystem } from './bitmapStreamSubsystem';
import { buildEarthPageTable } from '../../../utils/scene/buildEarthPageTable';
import { earthBaseLevelForTier } from '../../../utils/scene/earthBaseLevelForTier';
import { earthTilePath } from '../../../utils/scene/earthTilePath';
import { fetchEarthTileManifest } from '../../../utils/scene/fetchEarthTileManifest';
import { fetchEarthTileBitmap } from '../../../utils/network/fetchEarthTileBitmap';
import { loadFadeAlpha } from '../../../utils/render/disk/loadFadeAlpha';
import {
  EARTH_TILE_ATLAS_SIDE,
  EARTH_TILE_CONCURRENCY,
  EARTH_TILE_FADE_MS,
  EARTH_TILE_LOD_BIAS,
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
  let manifest: EarthTileManifest | null = null;
  // The derived params and the tier they were derived AT, kept together so the
  // pair can only be read as one. The tier is a live user setting, and the base
  // level is a fact about the texture that tier binds, so a params object cached
  // without its tier would keep answering for the previous one after a swap.
  let params: EarthTilePlannerParams | null = null;
  let paramsTier: Tier | null = null;

  // ── Lazily-allocated GPU state ──────────────────────────────────────────
  let stream: BitmapStreamSubsystem | null = null;
  let pageTable: GPUTexture | null = null;
  let resources: { readonly pageTable: GPUTextureView; readonly atlas: GPUTextureView } | null =
    null;
  let slotsPerRow = 0;

  const resident = new Map<string, ResidentTile>();

  let frameCounter = 0;
  // The last frame's stamped clock, so an arrival stamps its `readyMs` from the
  // frame clock rather than sampling `performance.now()` itself. At most one frame
  // stale, which is nothing against a 400 ms fade, and it keeps the fade
  // deterministic under a stepped recorder clock.
  let lastFrameNowMs = 0;
  // Set by an arrival or an eviction; cleared by an upload. The window moving is
  // the other reason to rebuild, and it is read off the frame's plan rather than
  // flagged because it is a property of the current frame.
  let residencyDirty = false;
  // What the page table IN GPU MEMORY holds: the window it was built against —
  // not the latest plan's — and whether every fade weight in it had reached full.
  // Written only by `uploadPageTable`, so both facts and the texture's contents
  // are always the same age. That pairing is what the fragment's cell arithmetic
  // depends on, and it is why the window is surfaced through its own accessor
  // rather than read off the plan at the draw site (see `getUploadedWindow`).
  //
  // `saturated` is what asks for the terminal frame of a load fade, in place of
  // asking the clock whether a fade is in progress. The two questions differ by
  // exactly one frame and the clock answers the wrong one: `loadFadeAlpha` reaches
  // 1 when the elapsed time REACHES the fade duration, so on that frame "is a fade
  // in progress?" is already false, no rebuild happens, and the last table ever
  // written keeps a weight just under 1 — a parked camera blended at ~97% against
  // the base forever. A record of what was actually uploaded cannot disagree with
  // itself that way.
  //
  // `null` doubles as the stood-down state: only an upload sets this and only
  // `standDown` clears it, so "has the blank table already gone up for this
  // disengaged spell?" needs no flag of its own — and a camera parked just outside
  // the engage altitude still re-uploads its 64 KB of zeroes exactly once.
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
   * Turn a fetched manifest plus the tier Earth's surface texture is bound at
   * into planner inputs, or null if the bake the manifest describes is one this
   * build cannot address. Every rejection degrades the feature to base-only,
   * which is the identity case and the same picture Earth draws with no manifest
   * at all — so a refusal costs a reader nothing to reason about, while the
   * alternative (adapting) would be silently wrong pixels.
   *
   * ## Why the TIER is an argument
   *
   * `baseLevel` is a fact about the whole-globe image the session actually
   * bound, and the three tiers bind three different images (z2 / z3 / z4). The
   * subsystem has no business knowing which one that is — the drive site reads
   * it off the texture slot — so it arrives here and is inverted onto the ladder
   * by `earthBaseLevelForTier`. Everything downstream (the walk floor, the
   * engage gate, the request floor) then follows from one number instead of
   * three parallel assumptions.
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
  function derivePlannerParams(
    fetched: EarthTileManifest,
    tier: Tier,
  ): EarthTilePlannerParams | null {
    const levels = fetched.levels?.[TILED_KIND];
    if (!levels) return null;
    const tilePx = fetched.tilePx ?? EARTH_TILE_PX;
    if (tilePx !== EARTH_TILE_PX) return null;
    const baseLevel = earthBaseLevelForTier(tier);
    // The manifest is authoritative for what was BAKED; the base level is
    // authoritative for what is already bound. The request floor is the deeper of
    // the two, because a level at or above the base would re-download detail the
    // whole-globe image already carries, and a level the bake never emitted is a
    // 404. Deriving it from THIS session's base rather than a module constant is
    // what lets a bake that reaches shallower serve a coarser tier: at `small`
    // (base z2) a z3 tile is a genuine refinement, while at `large` (base z4) the
    // same file is detail already on screen.
    const minTileLevel = Math.max(levels.min, baseLevel + 1);
    if (!(levels.max >= minTileLevel)) return null;
    return {
      kind: TILED_KIND,
      tilePx,
      baseLevel,
      minTileLevel,
      maxTileLevel: levels.max,
      windowSide: EARTH_TILE_WINDOW_SIDE,
      lodBias: EARTH_TILE_LOD_BIAS,
    };
  }

  /**
   * Re-derive the params for `tier`, from the manifest if it has landed. The one
   * writer of the `(params, paramsTier)` pair, so the two cannot describe
   * different tiers, and the one place a null params comes from — either the
   * manifest is not here yet or the bake it describes was refused, and neither
   * is a state the readers need to tell apart.
   */
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
        // Derived here rather than on the next call, so `update()` has params to
        // work with on the same frame the manifest lands — the drive site's
        // ordering (params, then plan, then update) is a convention, and this
        // does not depend on it.
        refreshParams(paramsTier ?? tier);
      });
    }
    // Re-derived only on a tier change, so the steady state is one comparison
    // per frame. Holding the manifest rather than the params alone is what lets
    // a swap be answered from memory instead of a second fetch.
    if (paramsTier !== tier) refreshParams(tier);
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

  /**
   * Whether the table in GPU memory still owes an upload for a reason that has
   * nothing to do with where the camera is: residency changed under it, or the
   * weights it carries are still mid-fade.
   *
   * The rebuild and the keep-ticking vote both read THIS, which is what stops
   * `isAnimating()` from going quiet one frame before the rebuild it exists to let
   * happen. The window moving is deliberately not in here: it is a property of the
   * frame's plan, the camera driver is already voting to keep the loop awake while
   * it moves, and `isAnimating()` has no plan to compare against.
   *
   * No live table means nothing is owed, which is what keeps a disengaged spell
   * from pinning the loop awake: a tile can still land while the camera sits
   * outside the engage bracket, and a disengaged frame never rebuilds, so a dirty
   * flag with nothing to flush into would vote to keep ticking forever. It is left
   * set for the re-engaging frame to clear.
   */
  function rebuildOwed(): boolean {
    return uploaded !== null && (residencyDirty || !uploaded.saturated);
  }

  function uploadPageTable(plan: EarthTilePlan, tilePx: number, nowMs: number): void {
    if (pageTable === null) return;
    const projected: EarthResidentTile[] = [];
    // Recorded from the weights that actually go into this table. An empty
    // resident set is saturated vacuously, which is right: there is no fade left
    // to finish, and the table is as settled as it will get.
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

  /**
   * Leave the virtual texture showing nothing, once, on the frame the engage
   * rule goes false.
   *
   * An all-zero page table is the identity: A is the blend weight, so a zeroed
   * cell tells the fragment to take the whole-globe base texture and nothing
   * else — the picture Earth draws in a session that never engages at all.
   * Zeroing the table and reporting a null window from `getUploadedWindow()`
   * are belt and braces, and either alone would be sufficient: the null window
   * makes the draw site pack the all-zero identity window, and the zeroed cells
   * make every cell the fragment could address weightless regardless of what
   * window it addresses them through.
   *
   * Nothing is freed. The atlas costs 67 MB but re-fetching every tile costs a
   * network round trip each, and the camera that just pulled out of the engage
   * bracket is the one most likely to come straight back; the LRU is already the
   * answer to genuine capacity pressure, and `destroy()` to a real teardown.
   */
  function standDown(): void {
    // Never allocated means nothing to stand down — this is the path a session
    // that never approaches Earth takes on every frame, and it must stay free. A
    // null `uploaded` under an allocated table means the blank has already gone
    // up, so the stand-down stays a transition rather than a per-frame state.
    if (pageTable === null || uploaded === null) return;
    device.queue.writeTexture(
      { texture: pageTable },
      new Uint8Array(EARTH_TILE_WINDOW_SIDE * EARTH_TILE_WINDOW_SIDE * 4),
      { bytesPerRow: EARTH_TILE_WINDOW_SIDE * 4, rowsPerImage: EARTH_TILE_WINDOW_SIDE },
      [EARTH_TILE_WINDOW_SIDE, EARTH_TILE_WINDOW_SIDE, 1],
    );
    // Nulling this is what re-arms the rebuild: the next engaged frame reads it
    // as a moved window, so the table is re-derived before anything is drawn
    // through it.
    uploaded = null;
  }

  function update(input: { readonly plan: EarthTilePlan; readonly nowMs: number }): void {
    if (destroyed) return;
    const active = params;
    // Only reachable if the drive site called `update` before `plannerParams`
    // answered; there is nothing to plan against, so there is nothing to do.
    if (active === null) return;

    const { plan, nowMs } = input;
    // Stamped on disengaged frames too: a tile can still land while the camera
    // sits outside the engage bracket, and its fade should start from a current
    // clock rather than from whenever the last engaged frame was.
    lastFrameNowMs = nowMs;

    if (!(plan.zWin > active.baseLevel)) {
      standDown();
      return;
    }

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

      // The returned index is deliberately dropped: it is true of this frame,
      // and the fetch below lands several frames later. What the allocation is
      // for here is the claim itself and its refusal — null means the atlas is
      // full of slots claimed earlier in this same frame, so this tile is over
      // budget and the planner's largest-first order decides who loses.
      if (atlas.allocate(key, frameCounter) === null) continue;
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
          // The slot is resolved from the key at the moment of the write, and
          // the answer is whatever the atlas says NOW: the tile may have been
          // evicted during the round trip, or evicted and re-requested into a
          // different slot. A null means the atlas holds nothing for this tile
          // and the pixels have nowhere to go, so nothing is recorded — the
          // tile stays unloaded, and a later frame that still wants it will ask
          // again.
          const slot = atlas.uploadBitmap(key, bitmap);
          bitmap.close();
          if (slot === null) return;
          resident.set(key, { tile: request.tile, slot, readyMs: lastFrameNowMs });
          residencyDirty = true;
        },
      });
    }

    const windowMoved =
      uploaded === null ||
      uploaded.window.zWin !== plan.zWin ||
      uploaded.window.winX0 !== plan.winX0 ||
      uploaded.window.winY0 !== plan.winY0;
    // Weights short of full mean the table in memory is mid-fade, so it is rebuilt
    // every frame until the last arrival has ramped all the way out — including the
    // frame the ramp lands on, which is the one that puts full weight on screen.
    // That is also what carries the fade visually: nothing else changes during it.
    if (windowMoved || rebuildOwed()) {
      uploadPageTable(plan, active.tilePx, nowMs);
    }
  }

  function isAnimating(): boolean {
    if (manifestPending) return true;
    if (stream !== null && stream.inFlightCount() > 0) return true;
    return rebuildOwed();
  }

  function destroy(): void {
    destroyed = true;
    stream?.destroy();
    stream = null;
    pageTable?.destroy();
    pageTable = null;
    resources = null;
    resident.clear();
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
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
