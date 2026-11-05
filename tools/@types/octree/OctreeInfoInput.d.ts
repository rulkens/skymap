import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { ColumnSchema } from '../../../src/@types/octree/ColumnSchema';

/**
 * CPU-only columns, indexed by input row, written beside each render object through its
 * `sourceRows`. A Float32Array is quantised through its schema row; a Uint8Array or
 * BigUint64Array is already raw wire values.
 */
export type OctreeInfoInput = {
  readonly schema: readonly ColumnSchema[];
  readonly columns: ReadonlyMap<ColumnId, Float32Array | Uint8Array | BigUint64Array>;
};
