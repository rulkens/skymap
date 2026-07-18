/**
 * StarCatalogNode — one entry in the star catalog's in-file octree.
 *
 * The star format hangs its 6-byte records off a spatial octree so the
 * renderer can draw a flux mip: at a distance where thousands of leaf
 * stars would smear into an unresolved glow, it draws the single
 * aggregate record for their interior node instead. Each node names a
 * contiguous slice of the record array (`firstRecord … firstRecord +
 * recordCount`) and locates itself in space through a Morton index.
 *
 * A node is a *leaf* when `childMask === 0` (its `recordCount` real stars
 * sit in the box the Morton index + level address) and an *aggregate* when
 * `childMask !== 0` (a single flux-weighted centroid record standing in for
 * the whole subtree, its box scaled ×2^level). The leaf-vs-aggregate
 * distinction lives on `childMask`, never on `level` and never as a marker
 * bit inside the byte-identical record — see `starCatalogFormat.ts`. Level
 * does NOT discriminate: a *fat leaf* (a sparse subtree merged into one
 * node to shrink the node table) is a leaf that lives at `level > 0`, so
 * its records are real stars re-expressed at the coarser box's resolution.
 *
 * On disk each node is a fixed 16 bytes (`NODE_BYTES`); this is the
 * decoded, renderer-facing shape.
 */
export type StarCatalogNode = {
  /**
   * Morton (Z-order) index locating and sizing the node's box within the
   * quantization grid. Interleaved x/y/z bits at `mortonBitsPerAxis`
   * resolution; combined with the node's `level` it reconstructs the
   * cell origin the child records offset from.
   */
  readonly mortonIndex: number;

  /**
   * Octree level: sizes the node's box, which spans 2^level leaf cells per
   * axis (1 for a level-0 finest cell). Does NOT discriminate leaf from
   * aggregate — a fat leaf lives at level > 0; use `childMask` for that.
   * Stored as a single on-disk byte, so the value is in 0..255.
   */
  readonly level: number;

  /**
   * Octree descent bitmask — which of the eight child octants exist below
   * this node. **This is the leaf-vs-aggregate discriminant: `0` ⇒ a leaf
   * (real star records, level-0 or fat); non-zero ⇒ an aggregate.**
   * Occupies the 3 reserved on-disk bytes
   * after `level`, read as a 24-bit unsigned integer composed of three
   * little-endian bytes (byte 5 = bits 0-7, byte 6 = bits 8-15, byte 7 =
   * bits 16-23). Only the low 8 bits are meaningful today; the upper bits
   * stay reserved for future descent metadata.
   */
  readonly childMask: number;

  /** Index of this node's first record in the catalog's record array. */
  readonly firstRecord: number;

  /**
   * Number of records this node owns: for a leaf (`childMask === 0`), the
   * count of real stars in its box (one for a level-0 cell, its whole
   * subtree for a fat leaf); for an aggregate, always 1 (its single
   * flux-mip record).
   */
  readonly recordCount: number;
};
