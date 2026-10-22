import type { OctreeFamily } from '../../@types/octree/OctreeFamily';
import { OCTREE_FAMILIES } from '../../data/octree/octreeFamilies';

/** The index's info object beside it (`<name>.info.bin`); the data manifest maps it to its hashed name. */
export function octreeIndexInfoPath(family: OctreeFamily, name: string): string {
  return `${OCTREE_FAMILIES[family].dataPrefix}/${name}.info.bin`;
}
