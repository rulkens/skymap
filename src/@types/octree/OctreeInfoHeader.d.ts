import type { ColumnSchema } from './ColumnSchema';

/** An info object's JSON header: CPU-only columns beside a render object, no node table; it names its own columns. */
export type OctreeInfoHeader = {
  readonly kind: 'info';
  /** The paired render object's record count, in the same order. */
  readonly records: number;
  readonly columns: readonly ColumnSchema[];
};
