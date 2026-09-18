/** Where a lat/lon lands inside one pyramid level: the tile, and the
 *  fractional post position within it. `rowFrac` counts from the NORTH row,
 *  as the raster is stored. */
export type TilePostPosition = {
  readonly x: number;
  readonly y: number;
  readonly colFrac: number;
  readonly rowFrac: number;
};
