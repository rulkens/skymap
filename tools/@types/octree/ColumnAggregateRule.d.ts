import type { AggregateBlob } from './AggregateBlob';
import type { AggregateRecord } from './AggregateRecord';

/** How one aggregate kind forms a blob from the records it stands for. */
export type ColumnAggregateRule = {
  /** Output values per record: 3 for a centroid, else 1. */
  readonly width: number;
  /** f64 sums kept per row: 3 for a centroid, 1 for the flux means. */
  readonly sums: number;
  /** A centroid reads the record positions; every other kind its own input column. */
  readonly input: 'positions' | 'column';
  /** An own record: writes its `width` values at `out[width·rec + a]` and adds its weight into `sums[s][row]`. */
  own: (
    r: AggregateRecord,
    out: Float32Array,
    rec: number,
    sums: readonly Float64Array[],
    row: number,
  ) => void;
  /** A node with children: writes the blob's values at `out[width·at + a]` from the row's subtree sums. */
  blob: (
    b: AggregateBlob,
    out: Float32Array,
    at: number,
    sums: readonly Float64Array[],
    row: number,
  ) => void;
};
