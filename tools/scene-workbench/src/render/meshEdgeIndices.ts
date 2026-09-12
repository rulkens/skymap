/**
 * Triangle indices → deduplicated line-list indices for the wireframe overlay,
 * split by adjacency: exactly two adjacent triangles is manifold, anything
 * else — a hole's border (one) or a non-manifold junction (three or more) — is
 * open, and the renderer draws the two classes in different colours.
 *
 * Keys packed into one Float64Array and sorted natively, not a Map: a
 * 925k-triangle mesh raises 2.8M edges, where a Map's per-entry allocation
 * dominates both load time and transient memory.
 */
export function meshEdgeIndices(indices: Uint32Array): {
  manifold: Uint32Array;
  open: Uint32Array;
} {
  const triangles = Math.floor(indices.length / 3);
  const edgeCount = triangles * 3;

  let maxIndex = 0;
  for (let i = 0; i < edgeCount; i++) if (indices[i]! > maxIndex) maxIndex = indices[i]!;
  const bound = maxIndex + 1;
  if (bound * bound > Number.MAX_SAFE_INTEGER) {
    throw new Error(`mesh has ${bound} vertices — packed edge keys would lose precision`);
  }

  const keys = new Float64Array(edgeCount);
  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3]!;
    const b = indices[t * 3 + 1]!;
    const c = indices[t * 3 + 2]!;
    keys[t * 3] = edgeKey(a, b, bound);
    keys[t * 3 + 1] = edgeKey(b, c, bound);
    keys[t * 3 + 2] = edgeKey(c, a, bound);
  }
  keys.sort();

  // Each class can hold every edge, so both scratch buffers are worst-cased
  // and copied down to their filled length at the end.
  const manifold = new Uint32Array(edgeCount * 2);
  const open = new Uint32Array(edgeCount * 2);
  let manifoldLength = 0;
  let openLength = 0;
  for (let start = 0; start < edgeCount; ) {
    const key = keys[start]!;
    let end = start + 1;
    while (end < edgeCount && keys[end] === key) end++;
    const lo = Math.floor(key / bound);
    if (end - start === 2) {
      manifold[manifoldLength++] = lo;
      manifold[manifoldLength++] = key - lo * bound;
    } else {
      open[openLength++] = lo;
      open[openLength++] = key - lo * bound;
    }
    start = end;
  }

  return { manifold: manifold.slice(0, manifoldLength), open: open.slice(0, openLength) };
}

/** Order-independent so an edge's two windings collide on one key. */
function edgeKey(u: number, v: number, bound: number): number {
  return u < v ? u * bound + v : v * bound + u;
}
