import type { OctreeBuildInput } from '../@types/octree/OctreeBuildInput';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import { chunkOctree } from './chunkOctree';
import { stratifyOctree } from './stratifyOctree';

/** Max records in one chunk object, a first guess the v1/v2 A/B tunes (spec §10). */
export const CHUNK_CAPACITY = 32_768;

export function buildOctreeCatalog(
  input: OctreeBuildInput,
  capacity: number = CHUNK_CAPACITY,
): OctreeObjects {
  return chunkOctree(stratifyOctree(input), capacity);
}
