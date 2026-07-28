import type { EarthTileRequest } from './EarthTileRequest';

/**
 * EarthTilePlan — one frame's answer to "which tiles should be resident, and
 * where does the page-table window sit?".
 *
 * The window is the reason this is a plan rather than a bare tile list. A page
 * table sized to the deepest level's full grid is 8.4 MB at z11 and 537 MB at
 * z13, and the cost that kills it is not the allocation but the REBUILD — a full
 * rewrite on every residency change, several times a second during a descent.
 * A fixed 128 × 128 window at the finest currently-planned level is 64 KB
 * instead, which is what keeps "rebuild whole, never patch" affordable, and that
 * property is what makes a stale page-table texel pointing at a recycled atlas
 * slot structurally impossible.
 *
 * The window is enforced HERE, in the planner, and not in the shader: a tile
 * outside it is never requested, never resident, and never needs representing.
 * Ground outside the window falls back to the whole-globe base texture, which is
 * the same identity case an empty atlas produces.
 *
 * `zWin`, `winX0` and `winY0` travel to the fragment in the three trailing f32
 * slots of `EarthSurfaceUniforms` — slots that were already zeroed pad, so the
 * window costs no struct growth.
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
