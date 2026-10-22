import type { GalaxyOctreeObject } from '../../../@types/data/galaxyCatalog/GalaxyOctreeObject';
import type { ColumnId } from '../../../@types/octree/ColumnId';
import type { OctreeColumn } from '../../../@types/octree/OctreeColumn';

/** A galaxy chunk's render object and its info columns, held together for a lookup, apart from the pool. */
export type GalaxyChunkPair = {
  readonly chunk: GalaxyOctreeObject;
  /** In the render object's record order. */
  readonly info: ReadonlyMap<ColumnId, OctreeColumn>;
};
