import { describe, it, expect } from 'vitest';

import { simplifyToTriangles } from '../../../../tools/utils/meshes/simplifyToTriangles';

/** A `size` x `size`-cell grid in the XY plane, two triangles per cell
 *  (`size * size * 2` triangles), UVs spanning [0, 1] linearly. */
function buildGrid(size: number): {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
} {
  const verts = size + 1;
  const positions = new Float32Array(verts * verts * 3);
  const uvs = new Float32Array(verts * verts * 2);
  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) {
      const v = y * verts + x;
      positions[v * 3] = x;
      positions[v * 3 + 1] = y;
      positions[v * 3 + 2] = 0;
      uvs[v * 2] = x / size;
      uvs[v * 2 + 1] = y / size;
    }
  }
  const indices: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = y * verts + x;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return { positions, uvs, indices: new Uint32Array(indices) };
}

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
  it('simplifies a 64x64 grid (8192 tris) to within ±5% of 2000', async () => {
    const { positions, uvs, indices } = buildGrid(64);
    expect(indices.length / 3).toBe(8192);

    const result = await simplifyToTriangles(positions, uvs, indices, 2000);

    expect(Math.abs(result.triangleCount - 2000) / 2000).toBeLessThanOrEqual(0.05);
    expect(result.indices.length).toBe(result.triangleCount * 3);
  });

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
