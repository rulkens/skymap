/**
 * FieldDustSlices — the dust map's depth-slice edges (io.wesl's `dustSlices`),
 * VIEW-dependent (a function of the eye's distance to the origin), so unlike
 * `FieldDustNoise` these are recomputed every `drawFrame` rather than derived
 * by the `dustHeaderLanes` node; only `R`, the dust's own reach, comes from it. See
 * io.wesl's `dustSlices` doc for the geometric-spacing derivation and why it
 * degenerates to linear from outside the galaxy and logarithmic from inside.
 */

export type FieldDustSlices = {
  readonly t1: number;
  readonly t2: number;
  readonly t3: number;
};
