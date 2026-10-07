/**
 * The GPU octree cut's handle: per-source node table, fade state and draw
 * lists, the compute that fills them, and what a draw binds to read them.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import type { StarDrawStream } from './StarDrawStream';
import type { StarCutInputs } from './StarCutInputs';
import type { StarCutDraw } from './StarCutDraw';

export type StarCutGpu = {
  /** `@group(1)` of `vertex.wesl`'s pipelines. */
  readonly drawBgl: GPUBindGroupLayout;
  /** Build a source's buffers; an empty catalog releases them. */
  upload(source: SourceType, catalog: StarCatalog): void;
  /** One compute pass: every source in `inputs` gets this frame's cut. */
  encode(
    encoder: GPUCommandEncoder,
    inputs: StarCutInputs,
    claimTimestampWrites: ClaimTimestampWrites,
  ): void;
  /**
   * The capture cut of `inputs` — its eye, every direction, no fade — submitted
   * at once on its own encoder. A second call for the same `inputs` does nothing.
   */
  submitCapture(inputs: StarCutInputs): void;
  /** `null` until that cut (the frame's, or the capture's) has run for the source. */
  drawOf(source: SourceType, stream: StarDrawStream, capture: boolean): StarCutDraw | null;
  destroy(): void;
};
