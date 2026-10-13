import type { OctreeBuildInput } from '../@types/octree/OctreeBuildInput';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import { chunkOctree } from './chunkOctree';
import { stratifyOctree } from './stratifyOctree';

/** Max records in one chunk object (spec §10). */
const CHUNK_CAPACITY = 32_768;

/**
 * Max node rows in one chunk object: the pool's per-slot row stride, which the cut sweeps every
 * frame. Roots pack under it, so it is also roughly every chunk's size (spec §4, §10).
 */
const CHUNK_NODE_CAPACITY = 2_048;

export function buildOctreeCatalog(input: OctreeBuildInput): OctreeObjects {
  return chunkOctree(stratifyOctree(input), CHUNK_CAPACITY, CHUNK_NODE_CAPACITY);
}
