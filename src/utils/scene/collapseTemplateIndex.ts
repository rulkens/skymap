/**
 * collapseTemplateIndex — the template vertex `(i, j)` a vertex is DRAWN at once
 * its edge has been collapsed onto a one-level-coarser neighbour's posts. TWIN of
 * the snap in `earthSurfaceTile/vertex.wesl`, with no production caller by design.
 * Edge order is R9's `[west, east, south, north]`; in the TEMPLATE that is
 * `i = 0`, `i = n`, `j = 0`, `j = n` — the anchor's lat0 is the SOUTH edge.
 */
export function collapseTemplateIndex(
  i: number,
  j: number,
  n: number,
  /** Code `1` only: at `2` the neighbour is more than one level away and has no
   *  post at the even index either, so that edge is skirted, never collapsed. */
  edgeCoarser: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2],
): readonly [number, number] {
  const alongWestEast = (i === 0 && edgeCoarser[0] === 1) || (i === n && edgeCoarser[1] === 1);
  const alongSouthNorth = (j === 0 && edgeCoarser[2] === 1) || (j === n && edgeCoarser[3] === 1);
  // The two axes are independent, so a corner on two collapsed edges snaps on both.
  return [alongSouthNorth ? i - (i % 2) : i, alongWestEast ? j - (j % 2) : j];
}
