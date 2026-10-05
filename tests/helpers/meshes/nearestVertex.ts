/** Index of the xyz triple in `positions` closest to `p`: the writer's vertex-cache
 * reorder means decoded and source vertices pair up by position, not index. */
export function nearestVertex(positions: ArrayLike<number>, p: ArrayLike<number>): number {
  let best = 0;
  let bestDist = Infinity;
  for (let v = 0; v < positions.length / 3; v++) {
    const dist = Math.hypot(...[0, 1, 2].map((c) => positions[v * 3 + c]! - p[c]!));
    if (dist < bestDist) {
      bestDist = dist;
      best = v;
    }
  }
  return best;
}
