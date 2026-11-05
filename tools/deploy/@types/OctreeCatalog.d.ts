import type { OctreeFamily } from '../../../src/@types/octree/OctreeFamily';

/** One baked octree catalog: the family says where it lives, the name is its index's basename. */
export type OctreeCatalog = { readonly family: OctreeFamily; readonly name: string };
