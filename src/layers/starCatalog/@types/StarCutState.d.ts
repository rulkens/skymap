/** One cut of a source: its own fade state, lists and uniforms. */

import type { StarDrawStream } from './StarDrawStream';

export type StarCutState = {
  readonly buffers: readonly GPUBuffer[];
  readonly uniforms: GPUBuffer;
  /** Two fade channels per pool row; a landing chunk zeroes its slot's rows. */
  readonly opacity: GPUBuffer;
  readonly draws: GPUBuffer;
  readonly computeBindGroup: GPUBindGroup;
  readonly drawBindGroups: Record<StarDrawStream, GPUBindGroup>;
  /** `null` until the first encode, which snaps every fade to its target. */
  lastMs: number | null;
};
