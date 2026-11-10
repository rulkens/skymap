/** `k` of `pool`'s entries, uniformly without replacement: a partial Fisher–Yates over a copy, in pick order. */
export function seededPick(pool: ArrayLike<number>, k: number, rng: () => number): Int32Array {
  const order = Int32Array.from(pool);
  const n = Math.min(k, order.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (order.length - i));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order.slice(0, n);
}
