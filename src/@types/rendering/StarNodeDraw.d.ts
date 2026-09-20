/** One instanced draw `walkStarOctreeCut` selected: a contiguous slice of
 * the catalog's record buffer. */

export type StarNodeDraw = {
  /** Index into `catalog.nodes` of the chosen node. */
  readonly nodeIndex: number;
  /** Base offset into the record buffer for this draw (`node.firstRecord`). */
  readonly firstRecord: number;
  /** Instance count: leaf → N stars in the cell; aggregate → 1. */
  readonly recordCount: number;
};
