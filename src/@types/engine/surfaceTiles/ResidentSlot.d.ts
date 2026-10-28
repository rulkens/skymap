/**
 * ResidentSlot — one exact tile's place in its product's atlas, the answer
 * `cutSurfaceTiles`' ancestor-fallback walk resolves each candidate through.
 */
export type ResidentSlot = {
  readonly slot: number;
  readonly atlasUvOrigin: readonly [number, number];
  readonly atlasUvScale: readonly [number, number];
  /** `performance.now()` (REAL time) stamped when this slot's bitmap
   *  uploaded — see `SurfaceCutTile.albedo.readyAtMs`. */
  readonly readyAtMs: number;
  /** HEIGHT only: the `SHGT` chunk's `subtreeMin/MaxM` (metres), which
   *  bound every descendant of this tile — the walk's frustum-cull
   *  headroom for displaced geometry. Null for albedo. */
  readonly subtreeRangeM: readonly [number, number] | null;
};
