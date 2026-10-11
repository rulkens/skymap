import type { OctreeBuildInput } from '../@types/octree/OctreeBuildInput';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import { chunkOctree } from './chunkOctree';
import { stratifyOctree } from './stratifyOctree';

/** Max records in one chunk object, a first guess the v1/v2 A/B tunes (spec §10). */
export const CHUNK_CAPACITY = 32_768;

/**
 * Max node rows in one chunk object: the pool's per-slot row stride, which the cut sweeps every
 * frame. Roots pack under it, so it is also roughly every chunk's size (spec §4, §10).
 */
export const CHUNK_NODE_CAPACITY = 2_048;

export function buildOctreeCatalog(
  input: OctreeBuildInput,
  capacity: number = CHUNK_CAPACITY,
): OctreeObjects {
  return chunkOctree(stratifyOctree(input), capacity, CHUNK_NODE_CAPACITY);
}
