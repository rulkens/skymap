/** Node rows as parallel typed arrays, `count` rows, sorted (level, morton) ascending. `firstRecord` is object-local. */
export type OctreeNodeTable = {
  readonly count: number;
  readonly morton: Uint32Array;
  /** 0 = finest cell. */
  readonly level: Uint8Array;
  /** Non-zero ⇒ a blob record follows the node's own records. */
  readonly childMask: Uint8Array;
  readonly firstRecord: Uint32Array;
  readonly ownCount: Uint32Array;
  /** Real records the blob stands for. */
  readonly blobCount: Uint32Array;
  /** Index into the index header's `chunks`, `NO_CHUNK_REF` when none. */
  readonly chunkRef: Uint32Array;
};
