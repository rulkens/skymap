/**
 * MilkyWayCloudBuffers — the GPU-filled instance buffers and draw-time
 * instance counts one generation pass produced for the Milky Way point
 * cloud. What `MilkyWayCloud.buffers()` hands the draw side each frame: a
 * plain snapshot, replaced wholesale on every tier switch.
 */
export type MilkyWayCloudBuffers = {
  readonly starBuf: GPUBuffer;
  /** Carved layout CAPACITY, not a "live" tally — a dead star past its fade radius keeps its slot and rasterizes a zero-area quad instead of shrinking the count. */
  readonly starCount: number;
  /** Null for a galaxy category ineligible for dust (elliptical, or `spriteDust <= 0`); the Milky Way preset always carves dust. */
  readonly dustBuf: GPUBuffer | null;
  readonly dustCount: number;
};
