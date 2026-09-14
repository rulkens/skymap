/**
 * Shared template index buffer for every resident surface patch, level and
 * body — one buffer, built once. Winding is `p00,p10,p01` / `p10,p11,p01`
 * (bakeSurfaceTileMesh.ts:71-84's order): u=east, v=north, CCW-outward,
 * matching the pipeline's `frontFace: 'ccw'` + `cullMode: 'back'`. `uint16`
 * suffices — `(resolution+1)²` stays far under 65536 at every resolution
 * this plan uses.
 */
export function surfacePatchIndices(resolution: number): Uint16Array {
  const row = resolution + 1;
  const indices = new Uint16Array(resolution * resolution * 6);
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
  return indices;
}
