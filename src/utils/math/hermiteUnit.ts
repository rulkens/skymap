/**
 * hermiteUnit — the cubic Hermite curve from (0, 0) to (1, 1) with end slopes
 * `m0` and `m1`, `u` clamped to [0, 1]. Monotone while `m0² + m1² ≤ 9` (Fritsch–
 * Carlson), which is why a matched join limits the slope at the other end.
 */
export function hermiteUnit(m0: number, m1: number, u: number): number {
  const x = Math.min(1, Math.max(0, u));
  const x2 = x * x;
  const x3 = x2 * x;
  return m0 * (x3 - 2 * x2 + x) + (3 * x2 - 2 * x3) + m1 * (x3 - x2);
}
