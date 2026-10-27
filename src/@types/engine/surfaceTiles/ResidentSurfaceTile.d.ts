/**
 * ResidentSurfaceTile — one atlas-resident tile in `SurfaceTileStream`: which
 * tile, which slot, and when its payload landed (REAL time — see
 * `ResidentSlot.readyAtMs`).
 */

import type { SurfaceTileId } from '../../data/SurfaceTileId';

export type ResidentSurfaceTile = {
  readonly tile: SurfaceTileId;
  readonly slot: number;
  readonly readyAtMs: number;
  /** HEIGHT only: the `SHGT` chunk's subtree bounds, which the walk turns
   *  into frustum-cull headroom for every descendant. Null for albedo. */
  readonly subtreeRangeM: readonly [number, number] | null;
  /** HEIGHT only: the chunk's own 17×17 grid (§8.4), kept in its wire
   *  encoding — 867 B/slot, decoded per query by `terrainHeightM`, never
   *  eagerly. Null for albedo. */
  readonly gridCodes: Uint8Array | null;
};
