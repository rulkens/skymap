import type { OctreeChunkRef } from '../../@types/octree/OctreeChunkRef';
import type { OctreeFamily } from '../../@types/octree/OctreeFamily';
import { OCTREE_FAMILIES } from '../../data/octree/octreeFamilies';
import { octreeChunkFileName } from '../../data/octree/octreeFormat';

export function octreeChunkPath(
  family: OctreeFamily,
  name: string,
  ref: Pick<OctreeChunkRef, 'level' | 'morton' | 'hash'>,
): string {
  return `${OCTREE_FAMILIES[family].dataPrefix}/${name}/${octreeChunkFileName(ref)}`;
}
