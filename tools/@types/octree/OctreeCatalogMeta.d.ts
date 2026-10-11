import type { ColumnSchema } from '../../../src/@types/octree/ColumnSchema';
import type { OctreeFamily } from '../../../src/@types/octree/OctreeFamily';
import type { OctreeGrid } from '../../../src/@types/octree/OctreeGrid';
import type { OctreeIndexHeader } from '../../../src/@types/octree/OctreeIndexHeader';
import type { OctreeStratify } from '../../../src/@types/octree/OctreeStratify';

/** What the index header carries beyond the objects themselves; `capacity` is the bake's chunk capacity. */
export type OctreeCatalogMeta = {
  readonly family: OctreeFamily;
  readonly grid: OctreeGrid;
  readonly stratify: OctreeStratify;
  readonly schema: readonly ColumnSchema[];
  readonly stats: OctreeIndexHeader['stats'];
  readonly capacity: number;
};
