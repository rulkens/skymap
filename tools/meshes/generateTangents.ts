/**
 * generateTangents — per-vertex tangent frame from UV gradients, the FALLBACK
 * for a source GLB that ships no `TANGENT` accessor. An authored frame is used
 * verbatim instead (`buildMeshes`); regenerating over one is a silent way to
 * break normal-mapped shading on an asset that was already correct.
 *
 * Accumulate dP/du per triangle onto its vertices, Gram-Schmidt against the
 * normal, and pack the bitangent's handedness into `w` — the `.mesh` format's
 * tangent layout, and what the shader reconstructs B from.
 */

export function generateTangents(geometry: {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}): Float32Array {
  const { positions, normals, uvs, indices } = geometry;
  const vertexCount = positions.length / 3;
  const tan = new Float32Array(vertexCount * 3);
  const bitan = new Float32Array(vertexCount * 3);

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    const du1 = uvs[b * 2]! - uvs[a * 2]!;
    const dv1 = uvs[b * 2 + 1]! - uvs[a * 2 + 1]!;
    const du2 = uvs[c * 2]! - uvs[a * 2]!;
    const dv2 = uvs[c * 2 + 1]! - uvs[a * 2 + 1]!;

    // A degenerate UV triangle has no gradient to contribute; skipping leaves
    // the vertex to its other faces, or to the fallback frame below.
    const det = du1 * dv2 - du2 * dv1;
    if (det === 0) continue;
    const r = 1 / det;

    for (let k = 0; k < 3; k++) {
      const e1 = positions[b * 3 + k]! - positions[a * 3 + k]!;
      const e2 = positions[c * 3 + k]! - positions[a * 3 + k]!;
      const t = (e1 * dv2 - e2 * dv1) * r;
      const bt = (e2 * du1 - e1 * du2) * r;
      for (const v of [a, b, c]) {
        tan[v * 3 + k] = tan[v * 3 + k]! + t;
        bitan[v * 3 + k] = bitan[v * 3 + k]! + bt;
      }
    }
  }

  const tangents = new Float32Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v++) {
    const nx = normals[v * 3]!;
    const ny = normals[v * 3 + 1]!;
    const nz = normals[v * 3 + 2]!;
    const dot = nx * tan[v * 3]! + ny * tan[v * 3 + 1]! + nz * tan[v * 3 + 2]!;
    let ox = tan[v * 3]! - nx * dot;
    let oy = tan[v * 3 + 1]! - ny * dot;
    let oz = tan[v * 3 + 2]! - nz * dot;
    let len = Math.hypot(ox, oy, oz);
    if (len === 0) {
      // No usable gradient reached this vertex: any unit vector perpendicular
      // to the normal beats a zero tangent, which would blow the frame up.
      [ox, oy, oz] = Math.abs(nx) < 0.9 ? [1 - nx * nx, -nx * ny, -nx * nz] : [0, nz, -ny];
      len = Math.hypot(ox, oy, oz) || 1;
    }
    const handed =
      (ny * oz - nz * oy) * bitan[v * 3]! +
      (nz * ox - nx * oz) * bitan[v * 3 + 1]! +
      (nx * oy - ny * ox) * bitan[v * 3 + 2]!;
    tangents[v * 4] = ox / len;
    tangents[v * 4 + 1] = oy / len;
    tangents[v * 4 + 2] = oz / len;
    tangents[v * 4 + 3] = handed < 0 ? -1 : 1;
  }
  return tangents;
}
