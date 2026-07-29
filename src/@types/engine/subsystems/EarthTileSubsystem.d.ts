/**
 * EarthTileSubsystem — residency for Earth's surface virtual texture.
 *
 * A third layer above the two the Earth renderer already has. The whole-globe
 * base texture and its placeholder stay exactly as they are, bound where they are
 * bound; this subsystem only changes what the fragment blends ON TOP of them, and
 * it never writes either of the renderer's `committed` / `placeholders` maps. The
 * consequence is that every failure path — no manifest, no atlas, a 404 on every
 * tile, a device that refuses the allocation — lands on the picture Earth draws
 * today rather than on a hole.
 *
 * ### What it owns
 *
 * One `BitmapStreamSubsystem` (the atlas, the LRU clock, the priority queue and
 * the ready/failed memoisation), one page-table texture, the arrival stamps that
 * drive the load fade, and the manifest once fetched. What it deliberately does
 * NOT own is the plan: `planEarthTiles` is pure and lives at the drive site, so
 * the one testable surface in the feature stays free of this file's GPU, network
 * and clock.
 *
 * ### Two lifecycle rules the shape enforces
 *
 * **Nothing GPU-side is allocated until the virtual texture first engages.** The
 * atlas is 67 MB and most sessions never approach Earth, so `update()` is what
 * creates it — not construction. `getTileResources()` returning `null` is the
 * before-engage state, and it is a state the renderer must be able to draw in,
 * since its bind-group layout is fixed at pipeline creation and cannot wait.
 *
 * **It never wakes the render loop itself.** Landed tiles wake it through the
 * stream subsystem's own `requestRender`, which is machinery that already exists;
 * everything else this subsystem knows about — an in-flight manifest, an in-flight
 * tile, a tile mid-fade — is surfaced as a vote through `isAnimating()` for the
 * frame loop's keep-ticking predicate to read. A subsystem that re-schedules
 * frames on its own behalf is how a render-on-demand loop quietly becomes a
 * continuous one.
 */

import type { EarthTilePlan } from '../../scene/EarthTilePlan';
import type { EarthTilePlannerParams } from '../../scene/EarthTilePlannerParams';
import type { Destroyable } from '../../rendering/Destroyable';

export type EarthTileSubsystem = Destroyable & {
  /**
   * The pyramid + window facts `planEarthTiles` needs, or `null` while they are
   * unknown — which is the state before the manifest lands and the permanent
   * state if it never does.
   *
   * The first call starts the one-shot manifest fetch, because the engage rule
   * (`plan.zWin > baseLevel`) is stated in terms of a plan the planner cannot
   * produce without these facts, so a gate that waited for engagement before
   * fetching would be waiting on its own answer. Calling it costs one small JSON
   * per session and nothing after.
   */
  plannerParams(): EarthTilePlannerParams | null;

  /**
   * Drive one frame. Call it on EVERY frame Earth's layer draws — the
   * subsystem, not the caller, decides from the plan whether the virtual
   * texture is engaged (`plan.zWin > baseLevel`, "has the base texture started
   * magnifying yet?").
   *
   * Engaged, it touches every planned tile's LRU slot largest-first, enqueues
   * whatever is neither resident nor known-missing, and re-derives the page
   * table if anything about residency, the window or a fade moved. The first
   * engaged call is what allocates the atlas and the page table.
   *
   * Disengaged, it stands down: once on the transition it blanks the page table
   * so the fragment blends nothing on top of the whole-globe base, and it stops
   * there — the atlas, the resident tiles and the caller's bind group all
   * survive, so coming back is free. A subsystem that has never engaged does
   * nothing at all on a disengaged frame and allocates nothing.
   *
   * The gate lives in here because as a caller-side `if` it only has one side:
   * engaging is something the caller does, disengaging is something that stops
   * happening, and a stand-down has nowhere to live.
   */
  update(input: { readonly plan: EarthTilePlan; readonly nowMs: number }): void;

  /**
   * The two views the Earth fragment binds, or `null` before the first engaged
   * frame. Stable by identity once created, so a caller can rebuild its bind
   * group on the transition rather than every frame.
   */
  getTileResources(): {
    readonly pageTable: GPUTextureView;
    readonly atlas: GPUTextureView;
  } | null;

  /**
   * The window the page table currently in GPU memory was built against, or
   * `null` when there is no live table to address: before the first upload, and
   * again for as long as the subsystem is stood down. The Earth draw packs it
   * into the surface uniforms, where it is the coordinate system the fragment
   * turns a mesh uv into a page-table cell in, and `null` packs the all-zero
   * identity window.
   *
   * Reporting `null` while stood down is belt and braces with the blanked page
   * table that stand-down uploads: either alone would leave the fragment
   * sampling nothing but the base texture, and both are cheap.
   *
   * **The UPLOADED window, never the latest plan's**, and that is the entire
   * reason it is an accessor here rather than a field the draw site reads off
   * the plan. The page table is re-derived only when residency changed, the
   * window moved, or a fade is still ramping; on every frame in between, the
   * plan is newer than the texture. Pairing a newer window with older contents
   * would misaddress every cell — the same uv would resolve to different ground
   * — so the two must be read from one place that only ever changes together.
   *
   * Kept separate from `getTileResources()` because the two have opposite
   * lifetimes: that one is identity-stable once non-null, so a caller reads it
   * to rebuild a bind group on the null-to-non-null transition; this one changes
   * with every upload and is read every frame.
   */
  getUploadedWindow(): {
    readonly zWin: number;
    readonly winX0: number;
    readonly winY0: number;
  } | null;

  /**
   * Whether anything this subsystem is doing will change the next frame's
   * picture: a manifest or a tile in flight, or a tile still ramping through its
   * load fade. A vote for the frame loop's keep-ticking predicate, never a wake.
   *
   * Read it even when not engaged — the in-flight manifest is what carries the
   * loop from "Earth is close" to the first engaged frame.
   */
  isAnimating(): boolean;
};
