import { describe, it, expect } from 'vitest';

import { generateTangents } from '../../../tools/meshes/generateTangents';

/** Unit quad in the XY plane, +Z normals, two triangles. */
const QUAD = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
};

describe('generateTangents()', () => {
  it('produces a unit tangent with the expected handedness', () => {
    // u runs with +X, v runs with +Y: tangent = +X, and cross(N, T) = +Y
    // already points the way v grows, so handedness is +1.
    const tangents = generateTangents({
      ...QUAD,
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    });

    expect(tangents).toHaveLength(16);
    for (let v = 0; v < 4; v++) {
      expect(tangents[v * 4 + 0]).toBeCloseTo(1, 6);
      expect(tangents[v * 4 + 1]).toBeCloseTo(0, 6);
      expect(tangents[v * 4 + 2]).toBeCloseTo(0, 6);
      expect(tangents[v * 4 + 3]).toBe(1);
    }
  });

  it('flips handedness when v runs against the geometric bitangent', () => {
    // Same geometry, v mirrored: the tangent stays +X but the bitangent the UVs
    // ask for is now -Y, which is what w = -1 encodes for the shader.
    const tangents = generateTangents({
      ...QUAD,
      uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
    });

    for (let v = 0; v < 4; v++) {
      expect(tangents[v * 4 + 0]).toBeCloseTo(1, 6);
      expect(tangents[v * 4 + 3]).toBe(-1);
    }
  });
});
