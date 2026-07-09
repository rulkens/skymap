/**
 * smoothstep — the canonical cubic Hermite ease, `3t² − 2t³`, with the
 * input clamped to the `[edge0, edge1]` band first.  The derivative is
 * zero at both edges, so a value crossing the band ramps in and out
 * without the visible kink a linear ramp would leave.
 *
 * This is the one fade primitive every distance/size-based overlay fade
 * leans on (the Milky-Way point cloud, the horizon shell, …), so the curve
 * is identical everywhere instead of each renderer hand-rolling the same
 * three-line clamp.  It matches the WGSL/GLSL built-in
 * `smoothstep(edge0, edge1, x)` exactly, so CPU-side fades stay in step
 * with any shader-side fade using the same band.
 *
 * `edge0 === edge1` is a degenerate (zero-width) band: rather than divide
 * by zero, it returns a hard step — `0` below the edge, `1` at or above.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
