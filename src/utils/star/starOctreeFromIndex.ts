import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { DecodedOctreeObject } from '../../@types/octree/DecodedOctreeObject';
import type { OctreeIndexHeader } from '../../@types/octree/OctreeIndexHeader';
import { starColumnsOf } from './starColumnsOf';

/** The octree index object as the shared runtime shape. */
export function starOctreeFromIndex(obj: DecodedOctreeObject<OctreeIndexHeader>): StarOctree {
  const { header, nodes, columns } = obj;
  const { starCount, chunkCount } = header.stats;
  if (starCount === undefined) throw new Error('star octree index lacks the starCount stat');
  if (chunkCount === undefined) throw new Error('star octree index lacks the chunkCount stat');
  return {
    grid: header.grid,
    starCount,
    columns: header.columns,
    nodes,
    records: starColumnsOf(columns, header.records),
    chunks: header.chunks,
    chunkCount,
    chunkCapacity: header.chunkCapacity,
    chunkNodeCap: header.chunkNodeCap,
  };
}
