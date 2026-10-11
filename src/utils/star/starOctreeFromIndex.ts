import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { DecodedOctreeObject } from '../../@types/octree/DecodedOctreeObject';
import type { OctreeIndexHeader } from '../../@types/octree/OctreeIndexHeader';
import { starColumnsOf } from './starColumnsOf';

/** The octree index object as the shared runtime shape; chunk ordinals follow the index's records. */
export function starOctreeFromIndex(obj: DecodedOctreeObject<OctreeIndexHeader>): StarOctree {
  const { header, nodes, columns } = obj;
  const starCount = header.stats.starCount;
  if (starCount === undefined) throw new Error('star octree index lacks the starCount stat');
  const recordOrdinalBase = new Uint32Array(header.chunks.length + 1);
  recordOrdinalBase[0] = header.records;
  header.chunks.forEach((chunk, i) => {
    recordOrdinalBase[i + 1] = recordOrdinalBase[i]! + chunk.records;
  });
  return {
    grid: header.grid,
    starCount,
    columns: header.columns,
    nodes,
    records: starColumnsOf(columns, header.records),
    chunks: header.chunks,
    chunkCapacity: header.chunkCapacity,
    chunkNodeCap: header.chunkNodeCap,
    recordOrdinalBase,
  };
}
