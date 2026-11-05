/**
 * computeSmoothNormals — per-vertex normals for a GLB primitive with no
 * NORMAL attribute. Accumulating the UN-normalized face normal (its length
 * is twice the triangle's area) folds the area weight and the direction into
 * one accumulate-then-normalize pass, so a degenerate (zero-area) triangle's
 * zero-length cross product drops out on its own — no separate area check.
 */

export function computeSmoothNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const vertexCount = positions.length / 3;
  const accum = new Float32Array(vertexCount * 3);

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    const ux = positions[b * 3]! - positions[a * 3]!;
    const uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
    const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
    const vx = positions[c * 3]! - positions[a * 3]!;
    const vy = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
    const vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i3 of [a * 3, b * 3, c * 3]) {
      accum[i3] = accum[i3]! + nx;
      accum[i3 + 1] = accum[i3 + 1]! + ny;
      accum[i3 + 2] = accum[i3 + 2]! + nz;
    }
  }

  const out = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) {
    const x = accum[v * 3]!;
    const y = accum[v * 3 + 1]!;
    const z = accum[v * 3 + 2]!;
    const len = Math.hypot(x, y, z);
    // No face contributed a direction (isolated vertex, or every touching
    // triangle was degenerate): fall back to flat-up rather than divide by 0.
    if (len === 0) {
      out[v * 3 + 2] = 1;
      continue;
    }
    out[v * 3] = x / len;
    out[v * 3 + 1] = y / len;
    out[v * 3 + 2] = z / len;
  }
  return out;
}
