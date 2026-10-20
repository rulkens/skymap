import type { OctreeFamily } from '../../@types/octree/OctreeFamily';
import { OCTREE_FAMILIES } from '../../data/octree/octreeFamilies';

export function octreeIndexPath(family: OctreeFamily, name: string): string {
  return `${OCTREE_FAMILIES[family].dataPrefix}/${name}.bin`;
}
