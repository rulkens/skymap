/**
 * smootherstep — Perlin's quintic `6u⁵ − 15u⁴ + 10u³`, `u` clamped to [0, 1].
 * Its first AND second derivatives vanish at both ends, so a weight built on it
 * joins a curve with no kink in value or velocity.
 */
export function smootherstep(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * x * (x * (6 * x - 15) + 10);
}
