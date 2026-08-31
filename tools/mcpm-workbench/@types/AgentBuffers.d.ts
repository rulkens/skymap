/**
 * AgentBuffers — the agent SoA lanes the particle views read, in io.wesl's slot order
 * (x/y/z at group(1) 3..5). Positions are VOXEL space, the frame the raymarch and the
 * agents already share. The buffers stay the harness's to destroy: a consumer that
 * outlives a rebuild must re-read them from the new harness.
 *
 * Indices [0, nDataPoints) are the catalog points; free agents follow, to `count` in
 * total. theta (io slot 7, the sim's own `createGridBuffers` buffer) isn't here: no
 * particle view reads it — only propagate/decay do, through their own bind groups.
 */
export type AgentBuffers = {
  readonly x: GPUBuffer;
  readonly y: GPUBuffer;
  readonly z: GPUBuffer;
  /** Deposit weights (io slot 6): data rows carry deriveAgentWeights' mass term, mean 1e6/nDataPoints. */
  readonly weight: GPUBuffer;
  readonly nDataPoints: number;
  readonly count: number;
};
