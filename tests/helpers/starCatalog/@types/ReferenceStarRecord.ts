/** One survey record as `vertex.wesl` places it: its node's box, then its offset inside that box. */

export type ReferenceStarRecord = {
  /** The owning node's min corner, in leaf cells (`CutNode.grid` decoded). */
  readonly cell: readonly [number, number, number];
  /** The owning node's level: its box spans `2^level` leaf cells. */
  readonly level: number;
  /** The record's 16-bit offset triple, `0..65535` of the box per axis. */
  readonly offset: readonly [number, number, number];
};
