/**
 * AgentBuffers — the agent SoA lanes the particle views read, in io.wesl's slot order
 * (x/y/z at group(1) 3..5, theta at 7). Positions are VOXEL space, the frame the raymarch
 * and the agents already share. The buffers stay the harness's to destroy: a consumer that
 * outlives a rebuild must re-read them from the new harness.
 *
 * Indices [0, nDataPoints) are the catalog points, carrying seedAgents' theta = -5
 * sentinel; free agents follow, to `count` in total.
 */
export type AgentBuffers = {
  readonly x: GPUBuffer;
  readonly y: GPUBuffer;
  readonly z: GPUBuffer;
  readonly theta: GPUBuffer;
  readonly nDataPoints: number;
  readonly count: number;
};
