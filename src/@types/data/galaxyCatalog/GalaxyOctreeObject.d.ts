import type { OctreeNodeTable } from '../../octree/OctreeNodeTable';
import type { GalaxyColumns } from './GalaxyColumns';

/** A decoded galaxy octree index or chunk object: its node table and records, record order shared. */
export type GalaxyOctreeObject = {
  readonly nodes: OctreeNodeTable;
  readonly records: GalaxyColumns;
};
