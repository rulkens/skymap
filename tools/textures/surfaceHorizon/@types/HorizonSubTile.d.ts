/** HorizonSubTile — one 33-post march unit of a horizon tile (`bakeHorizonSubTile`): its
 *  66 × 66 RGBA8 raster, packed by `horizonTexelOf`, and the highest angle any post marched. */
export type HorizonSubTile = {
  readonly rgba: Uint8Array;
  readonly maxDeg: number;
};
