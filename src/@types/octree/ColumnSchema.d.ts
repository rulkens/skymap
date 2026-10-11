import type { ColumnId } from './ColumnId';
import type { ColumnStore } from './ColumnStore';

/**
 * One record column of an octree catalog. Integer scalar stores dequantise as
 * `q0 + raw·q1`; float and packed-vector stores carry `q0 = 0, q1 = 1`.
 */
export type ColumnSchema = {
  readonly id: ColumnId;
  readonly store: ColumnStore;
  readonly q0: number;
  readonly q1: number;
};
