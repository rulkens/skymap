import type { OctreeCutSpec } from './OctreeCutSpec';
import type { OctreeDriverStep } from './OctreeDriverStep';
import type { OctreeDriverStream } from './OctreeDriverStream';

export type OctreeFrameDriver<C extends { readonly count: number }> = {
  /** One frame: plan the streams when due, then say whether to re-cut. `cut: null` is "nothing drawn". */
  step(
    nowMs: number,
    cut: OctreeCutSpec | null,
    streams: readonly OctreeDriverStream<C>[],
  ): OctreeDriverStep;
  /** Forget the last plan: the streams were re-installed. */
  reset(): void;
};
