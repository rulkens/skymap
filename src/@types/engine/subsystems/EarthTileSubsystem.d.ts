/**
 * EarthTileSubsystem — residency for Earth's surface virtual texture. A
 * third layer above the two the Earth renderer already has: base texture
 * and placeholder are untouched, so every failure path falls back to
 * today's picture rather than a hole. Owns the `BitmapStreamSubsystem`,
 * page-table texture, fade timestamps and manifest; `planEarthTiles`
 * stays pure. GPU resources allocate lazily on first engage; the
 * subsystem never wakes the render loop, only votes via `isAnimating()`.
 * Rationale: docs/superpowers/plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md
 */

import type { EarthTilePlan } from '../../scene/EarthTilePlan';
import type { EarthTilePlannerParams } from '../../scene/EarthTilePlannerParams';
import type { EarthTileDebugSnapshot } from '../../scene/EarthTileDebugSnapshot';
import type { Destroyable } from '../../rendering/Destroyable';
import type { Tier } from '../../data/Tier';

export type EarthTileSubsystem = Destroyable & {
  /**
   * The pyramid + window facts `planEarthTiles` needs, or `null` before the
   * manifest lands (first call triggers the one-shot fetch). `tier` fixes
   * `baseLevel` (three tiers, three base images z2/z3/z4).
   */
  plannerParams(tier: Tier): EarthTilePlannerParams | null;

  /**
   * Drive one frame; call every frame Earth's layer draws. Engaged or not
   * follows the plan (`plan.zWin > baseLevel`). Engaged: LRU-touches every
   * planned tile largest-first, enqueues anything missing, and re-derives
   * the page table on any change — allocating the atlas on first engage.
   * Disengaged: blanks the page table, then does nothing further.
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
   * The window the resident page table was built against, or `null` before
   * first upload / while stood down. Always the UPLOADED window, never the
   * latest plan's — re-derived only on residency/window/fade change, so a
   * newer window over older contents would misaddress every cell.
   * Separate from `getTileResources()`: that is identity-stable; this
   * changes every upload.
   */
  getUploadedWindow(): {
    readonly zWin: number;
    readonly winX0: number;
    readonly winY0: number;
  } | null;

  /**
   * Whether anything here changes next frame's picture — manifest or tile in
   * flight, or a tile still fading in. A vote for the frame loop's
   * keep-ticking predicate, never a wake; read even while disengaged.
   */
  isAnimating(): boolean;

  /**
   * A fresh, cheap-to-build snapshot of atlas residency for the DebugPanel —
   * see `EarthTileDebugSnapshot`. Never call this from a render path; it
   * exists for a low-rate poll, not the frame loop.
   */
  getDebugSnapshot(): EarthTileDebugSnapshot;
};
