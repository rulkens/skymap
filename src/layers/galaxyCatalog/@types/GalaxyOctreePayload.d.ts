import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { ColumnId } from '../../../@types/octree/ColumnId';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeColumn } from '../../../@types/octree/OctreeColumn';
import type { OctreeIndexHeader } from '../../../@types/octree/OctreeIndexHeader';

/** What the galaxy octree slot commits: the index as an `Octree`, its header, and its records' info columns. */
export type GalaxyOctreePayload = {
  readonly octree: Octree<GalaxyColumns>;
  /** Stats, chunk directory, pgc shards and named pgcs, which the `Octree` does not carry. */
  readonly header: OctreeIndexHeader;
  /** The index's own records' CPU-only columns, in record order. */
  readonly info: ReadonlyMap<ColumnId, OctreeColumn>;
};
