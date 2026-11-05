import type { Octree } from './Octree';
import type { OctreeChunkStream } from './OctreeChunkStream';

/** One source the frame driver plans: its chunk stream and the octree the planner walks. */
export type OctreeDriverStream<C extends { readonly count: number }> = {
  readonly stream: OctreeChunkStream<C>;
  readonly octree: Octree<C>;
};
