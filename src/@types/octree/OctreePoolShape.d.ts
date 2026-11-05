import type { OctreeRunSpan } from './OctreeRunSpan';

/**
 * An octree pool's size past the index: each chunk takes a record run and a node-row run, and
 * `slots` is the most chunks those runs can hold at their minimum sizes.
 */
export type OctreePoolShape = {
  readonly slots: number;
  readonly records: OctreeRunSpan;
  readonly nodes: OctreeRunSpan;
};
