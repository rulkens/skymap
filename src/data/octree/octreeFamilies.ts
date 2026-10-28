import type { OctreeFamily } from '../../@types/octree/OctreeFamily';
import type { OctreeFamilyRow } from '../../@types/octree/OctreeFamilyRow';
import { STAR_OCTREE_FAMILY } from './starOctreeFamily';

export const OCTREE_FAMILIES: Readonly<Record<OctreeFamily, OctreeFamilyRow>> = {
  star: STAR_OCTREE_FAMILY,
};
