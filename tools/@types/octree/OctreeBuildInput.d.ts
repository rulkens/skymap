import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { ColumnSchema } from '../../../src/@types/octree/ColumnSchema';
import type { OctreeGrid } from '../../../src/@types/octree/OctreeGrid';
import type { OctreeStratify } from '../../../src/@types/octree/OctreeStratify';

/** One catalog handed to the family-agnostic octree bake. */
export type OctreeBuildInput = {
  readonly grid: OctreeGrid;
  readonly stratify: OctreeStratify;
  /** 3·n positions in the catalog unit, relative to `grid.origin`. */
  readonly positions: Float64Array;
  /** The column `levelForMagnitude` reads (`absMag` for stars). */
  readonly magnitudeColumn: ColumnId;
  /** Dequantised per-record values, one array per schema column except `offset` (derived from `positions`). */
  readonly columns: ReadonlyMap<ColumnId, Float32Array>;
  readonly schema: readonly ColumnSchema[];
};
