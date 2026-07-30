import type { EarthTileRequest } from './EarthTileRequest';

/**
 * EarthTilePlan — one frame's answer to "which tiles should be resident,
 * and where does the page-table window sit?". The window is why this is
 * a plan, not a bare tile list: a full-grid page table is 537 MB at z13,
 * and the REBUILD cost (not the allocation) is what kills it. A fixed
 * 128x128 window is 64 KB, enforced in the planner, not the shader.
 * `zWin`/`winX0`/`winY0` travel to the fragment in `EarthSurfaceUniforms`'s
 * already-zeroed trailing pad, so the window costs no struct growth.
 */
export type EarthTilePlan = {
  /** Finest level any leaf uses, and therefore the window's level. */
  readonly zWin: number;
  /** Window origin tile at `zWin`: west column. */
  readonly winX0: number;
  /** Window origin tile at `zWin`: north row. */
  readonly winY0: number;
  readonly requests: readonly EarthTileRequest[];
};
