/**
 * The GPU octree cut's handle: per-source node table, fade state and draw
 * lists, the compute that fills them, and what a draw binds to read them.
 */

import type { SourceType } from '../data/SourceType';
import type { OctreeChunk } from './OctreeChunk';
import type { Octree } from './Octree';
import type { ClaimTimestampWrites } from '../gpu/timing/ClaimTimestampWrites';
import type { OctreeChunkHost } from './OctreeChunkHost';
import type { OctreeDrawStream } from './OctreeDrawStream';
import type { OctreeCutInputs } from './OctreeCutInputs';
import type { OctreeCutDraw } from './OctreeCutDraw';

export type OctreeCutGpu = {
  /** `@group(1)` of `vertex.wesl`'s pipelines. */
  readonly drawBgl: GPUBindGroupLayout;
  /**
   * Build a source's pool-sized buffers (index rows, then `slots` chunk slots);
   * an empty octree releases them. Throws, creating nothing, past a pool cap.
   */
  upload(source: SourceType, octree: Octree<{ readonly count: number }>, slots: number): void;
  /** Write a landed chunk's rows into `slot`, zero its fades, then mark its roots resident. */
  uploadChunk(source: SourceType, slot: number, chunk: OctreeChunk<{ readonly count: number }>, host: OctreeChunkHost): void;
  /** Mark every root of the slot's `chunk` in `host` unresident, then empty the slot. */
  evictChunk(source: SourceType, slot: number, chunk: OctreeChunk<{ readonly count: number }>, host: OctreeChunkHost): void;
  /**
   * One compute pass: every source in `inputs` gets this frame's cut, or with `recut` false
   * only its uniforms, so the last cut's lists draw about this frame's eye.
   */
  encode(
    encoder: GPUCommandEncoder,
    inputs: OctreeCutInputs,
    recut: boolean,
    claimTimestampWrites: ClaimTimestampWrites,
  ): void;
  /**
   * The capture cut of `inputs` — its eye, every direction, no fade — submitted
   * at once on its own encoder. A second call for the same `inputs` does nothing.
   */
  submitCapture(inputs: OctreeCutInputs): void;
  /** `null` until that cut (the frame's, or the capture's) has run for the source. */
  drawOf(source: SourceType, stream: OctreeDrawStream, capture: boolean): OctreeCutDraw | null;
  destroy(): void;
};
