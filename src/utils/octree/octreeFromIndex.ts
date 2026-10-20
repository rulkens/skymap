import type { DecodedOctreeObject } from '../../@types/octree/DecodedOctreeObject';
import type { Octree } from '../../@types/octree/Octree';
import type { OctreeIndexHeader } from '../../@types/octree/OctreeIndexHeader';
import type { OctreeStreamFormat } from '../../@types/octree/OctreeStreamFormat';
import { OCTREE_FAMILIES } from '../../data/octree/octreeFamilies';

/** The octree index object as the shared runtime shape; the family decodes the records. */
export function octreeFromIndex<C extends { readonly count: number }>(
  obj: DecodedOctreeObject<OctreeIndexHeader>,
  decodeRecords: OctreeStreamFormat<C>['decodeRecords'],
): Octree<C> {
  const { header, nodes, columns } = obj;
  const { countStat } = OCTREE_FAMILIES[header.family];
  const recordCount = header.stats[countStat];
  const { chunkCount } = header.stats;
  if (recordCount === undefined) throw new Error(`octree index lacks the ${countStat} stat`);
  if (chunkCount === undefined) throw new Error('octree index lacks the chunkCount stat');
  return {
    family: header.family,
    grid: header.grid,
    recordCount,
    columns: header.columns,
    nodes,
    records: decodeRecords(columns, header.records),
    chunks: header.chunks,
    chunkCount,
    chunkCapacity: header.chunkCapacity,
    chunkNodeCap: header.chunkNodeCap,
  };
}
