import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { ColumnId } from '../../../@types/octree/ColumnId';
import type { OctreeChunk } from '../../../@types/octree/OctreeChunk';
import type { OctreeColumn } from '../../../@types/octree/OctreeColumn';

/** A galaxy chunk's render object and its info columns, fetched together for a lookup, apart from the pool. */
export type GalaxyChunkPair = {
  readonly chunk: Pick<OctreeChunk<GalaxyColumns>, 'ref' | 'nodes' | 'records' | 'chunks'>;
  /** In the render object's record order. */
  readonly info: ReadonlyMap<ColumnId, OctreeColumn>;
};
