/**
 * Shared template index buffer for every resident surface patch, level and body
 * — one buffer, built once: a `(n+1)²` grid then a `4(n+1)`-vertex skirt ring in
 * R9 edge order [west, east, south, north], whose depth the vertex stage zeroes
 * on every edge that is not a band seam. Winding is CCW-outward throughout, the
 * sole definition of the pipeline's `frontFace: 'ccw'` + `cullMode: 'back'`.
 */
export function surfacePatchIndices(resolution: number): Uint16Array {
  const row = resolution + 1;
  const indices = new Uint16Array(resolution * resolution * 6 + 24 * resolution);
  let idx = 0;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const p00 = j * row + i;
      const p10 = j * row + i + 1;
      const p01 = (j + 1) * row + i;
      const p11 = (j + 1) * row + i + 1;
      indices[idx++] = p00;
      indices[idx++] = p10;
      indices[idx++] = p01;
      indices[idx++] = p10;
      indices[idx++] = p11;
      indices[idx++] = p01;
    }
  }

  // Boundary post b(k) per edge: west (0, k), east (n, k), south (k, 0),
  // north (k, n) — `vertex.wesl` maps the ring's vertex ids the same way.
  const edgeStart = [0, resolution, 0, resolution * row];
  const edgeStride = [row, row, 1, 1];
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < resolution; k++) {
      const b0 = edgeStart[e]! + k * edgeStride[e]!;
      const b1 = b0 + edgeStride[e]!;
      const s0 = row * row + e * row + k;
      const s1 = s0 + 1;
      // West (outward −Ê) and north (+N̂) wind one way, east (+Ê) and south
      // (−N̂) the other: a reversed skirt quad is invisible, not wrong-looking.
      if (e === 0 || e === 3) {
        indices[idx++] = b0;
        indices[idx++] = b1;
        indices[idx++] = s0;
        indices[idx++] = b1;
        indices[idx++] = s1;
        indices[idx++] = s0;
      } else {
        indices[idx++] = b1;
        indices[idx++] = b0;
        indices[idx++] = s1;
        indices[idx++] = b0;
        indices[idx++] = s0;
        indices[idx++] = s1;
      }
    }
  }
  return indices;
}
