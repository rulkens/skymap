/**
 * The atlas fraction the kept triangles sample: a plain sum of UV-triangle
 * areas, exact because an MVS atlas's charts never overlap; overlapping
 * charts would over-report.
 */
export function uvCoverage(uvs: Float32Array, indices: Uint32Array): number {
  let twiceArea = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = 2 * indices[t]!;
    const b = 2 * indices[t + 1]!;
    const c = 2 * indices[t + 2]!;
    twiceArea += Math.abs(
      (uvs[b]! - uvs[a]!) * (uvs[c + 1]! - uvs[a + 1]!) -
        (uvs[b + 1]! - uvs[a + 1]!) * (uvs[c]! - uvs[a]!),
    );
  }
  return twiceArea / 2;
}
