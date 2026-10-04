import { describe, it, expect } from 'vitest';

import { simplifyToTriangles } from '../../../../tools/utils/meshes/simplifyToTriangles';

/**
 * A grid split down its middle column into two UV halves that never share a
 * triangle: the seam column is duplicated (same position, u = 0.5 on both
 * sides), so no edge in the index buffer ever crosses it. Half A's u stays in
 * [0, 0.5], half B's in [0.5, 1].
 */
function buildSeamGrid(size: number): {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
} {
  const half = size / 2;
  const verts = size + 2; // one extra column: the seam is duplicated, not shared
  const positions: number[] = [];
  const uvs: number[] = [];
  // Column layout: x in [0, half] on side A (u = x / size), x in [half, size]
  // on side B reusing the same world x but its own duplicated seam vertex.
  const indexOf = (side: 'a' | 'b', gx: number, gy: number) => {
    const col = side === 'a' ? gx : gx + half + 1;
    return gy * verts + col;
  };
  for (let gy = 0; gy <= size; gy++) {
    for (let gx = 0; gx <= half; gx++) {
      positions[indexOf('a', gx, gy) * 3] = gx;
      positions[indexOf('a', gx, gy) * 3 + 1] = gy;
      positions[indexOf('a', gx, gy) * 3 + 2] = 0;
      uvs[indexOf('a', gx, gy) * 2] = gx / size;
      uvs[indexOf('a', gx, gy) * 2 + 1] = gy / size;
    }
    for (let gx = 0; gx <= half; gx++) {
      positions[indexOf('b', gx, gy) * 3] = gx + half;
      positions[indexOf('b', gx, gy) * 3 + 1] = gy;
      positions[indexOf('b', gx, gy) * 3 + 2] = 0;
      uvs[indexOf('b', gx, gy) * 2] = (gx + half) / size;
      uvs[indexOf('b', gx, gy) * 2 + 1] = gy / size;
    }
  }
  const indices: number[] = [];
  for (const side of ['a', 'b'] as const) {
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < half; gx++) {
        const a = indexOf(side, gx, gy);
        const b = indexOf(side, gx + 1, gy);
        const c = indexOf(side, gx, gy + 1);
        const d = indexOf(side, gx + 1, gy + 1);
        indices.push(a, b, d, a, d, c);
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

describe('simplifyToTriangles', () => {
  it('never lets a triangle span a UV seam', async () => {
    const { positions, uvs, indices } = buildSeamGrid(64);

    const result = await simplifyToTriangles(positions, uvs, indices, 2000);

    for (let i = 0; i < result.indices.length; i += 3) {
      const us = [0, 1, 2].map((k) => uvs[result.indices[i + k]! * 2]!);
      const allLow = us.every((u) => u <= 0.5 + 1e-6);
      const allHigh = us.every((u) => u >= 0.5 - 1e-6);
      expect(allLow || allHigh).toBe(true);
    }
  });
});
