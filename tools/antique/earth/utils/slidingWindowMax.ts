/**
 * slidingWindowMax — the max over [i − r, i + r] for every i of a line, in
 * O(n) whatever r (van Herk / Gil–Werman: running maxima forward and back
 * within blocks of 2r + 1, two lookups per window). Off the ends the line
 * either wraps (a full circle of longitude) or repeats its edge value.
 */

export function slidingWindowMax(line: Float32Array, r: number, wrap: boolean): Float32Array {
  const n = line.length;
  const w = 2 * r + 1;
  const m = n + 2 * r;
  const padded = new Float32Array(m);
  padded.set(line, r);
  if (wrap) {
    // r < n here: a window wider than the circle would count posts twice.
    padded.set(line.subarray(n - r), 0);
    padded.set(line.subarray(0, r), n + r);
  } else {
    padded.fill(line[0]!, 0, r);
    padded.fill(line[n - 1]!, n + r);
  }
  const forward = new Float32Array(m);
  const backward = new Float32Array(m);
  for (let p = 0; p < m; p++) {
    const v = padded[p]!;
    forward[p] = p % w === 0 || v > forward[p - 1]! ? v : forward[p - 1]!;
  }
  for (let p = m - 1; p >= 0; p--) {
    const v = padded[p]!;
    backward[p] = p % w === w - 1 || p === m - 1 || v > backward[p + 1]! ? v : backward[p + 1]!;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = backward[i]!;
    const b = forward[i + 2 * r]!;
    out[i] = a > b ? a : b;
  }
  return out;
}
