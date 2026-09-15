/** collapseTemplateIndex — template vertex `(i, j)` snapped onto a
 *  one-level-coarser neighbour's posts. TWIN of the snap in
 *  `earthSurfaceTile/vertex.wesl`. */
export function collapseTemplateIndex(
  i: number,
  j: number,
  n: number,
  /** Code `2` never collapses: that neighbour is more than one level away. */
  edgeCoarser: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2],
): readonly [number, number] {
  const alongWestEast = (i === 0 && edgeCoarser[0] === 1) || (i === n && edgeCoarser[1] === 1);
  const alongSouthNorth = (j === 0 && edgeCoarser[2] === 1) || (j === n && edgeCoarser[3] === 1);
  return [alongSouthNorth ? i - (i % 2) : i, alongWestEast ? j - (j % 2) : j];
}
