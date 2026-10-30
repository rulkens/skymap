import type { OctreeFamily } from '../../@types/octree/OctreeFamily';
import type { OctreeFamilyRow } from '../../@types/octree/OctreeFamilyRow';
import { GALAXY_OCTREE_FAMILY } from './galaxyOctreeFamily';
import { STAR_OCTREE_FAMILY } from './starOctreeFamily';

export const OCTREE_FAMILIES: Readonly<Record<OctreeFamily, OctreeFamilyRow>> = {
  star: STAR_OCTREE_FAMILY,
  galaxy: GALAXY_OCTREE_FAMILY,
};
