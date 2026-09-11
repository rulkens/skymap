/**
 * Triangle indices → line-list indices for the wireframe overlay: 3 edges per
 * triangle, 2 indices each. Shared edges are NOT deduplicated — every interior
 * edge is drawn twice, which costs a second identical line and saves a hash
 * set over ~650k triangles.
 */
export function meshEdgeIndices(indices: Uint32Array): Uint32Array {
  const triangles = Math.floor(indices.length / 3);
  const edges = new Uint32Array(triangles * 6);
  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3]!;
    const b = indices[t * 3 + 1]!;
    const c = indices[t * 3 + 2]!;
    const e = t * 6;
    edges[e] = a;
    edges[e + 1] = b;
    edges[e + 2] = b;
    edges[e + 3] = c;
    edges[e + 4] = c;
    edges[e + 5] = a;
  }
  return edges;
}
