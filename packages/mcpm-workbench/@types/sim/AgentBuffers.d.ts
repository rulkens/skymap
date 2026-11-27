/**
 * AgentBuffers — the agent SoA lanes the particle views read, in io.wesl's slot order
 * (x/y/z at group(1) 3..5), in VOXEL space. The harness destroys them on a rebuild.
 * Indices [0, nDataPoints) are the catalog points; free agents follow, to `count`.
 * theta (io slot 7) is absent: only propagate/decay read it.
 */
export type AgentBuffers = {
  readonly x: GPUBuffer;
  readonly y: GPUBuffer;
  readonly z: GPUBuffer;
  /** io slot 6. The sim's data rows: deriveAgentWeights' deposit weight; `overlayAgents`: mean 1, display only. */
  readonly weight: GPUBuffer;
  readonly nDataPoints: number;
  readonly count: number;
};
