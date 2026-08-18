/**
 * readPackedCatalog — decode the fork's flat f32 `[X, Y, Z, W]` packed
 * catalog (T21's format) into interleaved positions and a parallel weights
 * array. Takes an `ArrayBuffer` (not a path) so it's testable against
 * hand-built bytes, mirroring `readNpy`'s shape.
 */
export function readPackedCatalog(buf: ArrayBuffer): {
  positions: Float32Array;
  weights: Float32Array;
  count: number;
} {
  const quadCount = buf.byteLength / 16; // 4 × f32 per point: x, y, z, w
  if (!Number.isInteger(quadCount)) {
    throw new Error(
      `readPackedCatalog: buffer is ${buf.byteLength} bytes, not a multiple of 16 ` +
        '(expected flat f32 [x, y, z, w] quadruples)',
    );
  }
  const flat = new Float32Array(buf);
  const positions = new Float32Array(quadCount * 3);
  const weights = new Float32Array(quadCount);
  for (let i = 0; i < quadCount; i++) {
    positions[i * 3] = flat[i * 4]!;
    positions[i * 3 + 1] = flat[i * 4 + 1]!;
    positions[i * 3 + 2] = flat[i * 4 + 2]!;
    weights[i] = flat[i * 4 + 3]!;
  }
  return { positions, weights, count: quadCount };
}
