import type { SourceType } from '../data/SourceType';
import type { OctreeCutDraw } from '../octree/OctreeCutDraw';

/** One octree galaxy source's pick draw: its frame cut's leaf list and its `@group(2)` records block. */
export type PooledPickSourceDraw = {
  readonly source: SourceType;
  readonly cut: OctreeCutDraw;
  readonly recordsBindGroup: GPUBindGroup;
};
