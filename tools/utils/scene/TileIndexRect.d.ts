/** Inclusive tile index rect from `earthTileIndicesForBounds` — `xMax`/`yMax`
 *  are indices IN the rect, not one-past-the-end, so a bake loop's `<=` reads
 *  naturally against the whole-globe loops it replaces. */
export type TileIndexRect = {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
};
