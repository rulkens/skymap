import type { OctreeChunkRef } from '../../../@types/octree/OctreeChunkRef';
import type { GalaxyChunkPair } from './GalaxyChunkPair';

/** The few chunk pairs the latest lookups touched, by chunk id; a miss fetches both objects. */
export type GalaxyChunkPairCache = {
  /** Null when either fetch fails; a failure is not cached, so a later ask retries. */
  get(ref: OctreeChunkRef): Promise<GalaxyChunkPair | null>;
};
