/** latticePostGradient — height slope at one post of a leaf's sub-rect, in
 *  metres per POST, as (east, north): central differences, one-sided on the
 *  sub-rect's own edge rather than reading a neighbouring leaf's ground.
 *  TWIN of `latticePostGradient` in `earthSurfaceTile/lattice.wesl`. `postM`
 *  reads one post by `(col, row)`, rows counting SOUTH as the atlas's do. */
export function latticePostGradient(
  postM: (col: number, row: number) => number,
  col: number,
  row: number,
  cells: number,
): readonly [number, number] {
  const west = Math.max(col, 1) - 1;
  const east = Math.min(col + 1, cells);
  const north = Math.max(row, 1) - 1;
  const south = Math.min(row + 1, cells);
  return [
    (postM(east, row) - postM(west, row)) / (east - west),
    (postM(col, north) - postM(col, south)) / (south - north),
  ];
}
