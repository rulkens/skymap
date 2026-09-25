import { describe, it, expect } from 'vitest';

import { computeSmoothNormals } from '../../../../tools/utils/meshes/computeSmoothNormals';

describe('computeSmoothNormals', () => {
  it('a flat CCW quad in the XY plane gets [0,0,1] everywhere', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);

    const normals = computeSmoothNormals(positions, indices);

    for (let v = 0; v < 4; v++) {
      expect(normals[v * 3]).toBeCloseTo(0, 6);
      expect(normals[v * 3 + 1]).toBeCloseTo(0, 6);
      expect(normals[v * 3 + 2]).toBeCloseTo(1, 6);
    }
  });

  it('a vertex shared by two 90°-apart faces gets the area-weighted mean', () => {
    // Vertex 0 is the shared corner: face A (0,1,2) is a right triangle in the
    // XY plane (legs 2 and 1, area 1); face B (0,3,2) is a right triangle in
    // the XZ/YZ-ish plane (legs 1 and 1, area 0.5). The area-weighted mean
    // must lean towards face A's normal, not split the two 50/50.
    const v0 = [0, 0, 0];
    const v1 = [2, 0, 0];
    const v2 = [0, 1, 0];
    const v3 = [0, 0, 1];
    const positions = new Float32Array([...v0, ...v1, ...v2, ...v3]);
    const indices = new Uint32Array([0, 1, 2, 0, 3, 2]);

    const normals = computeSmoothNormals(positions, indices);
    // The un-normalized face normal computeSmoothNormals accumulates is
    // cross(b - a, c - a) for each triangle (a, b, c) — reproduced here
    // rather than hand-derived, so a transcription slip can't hide a bug.
    const cross = (u: number[], v: number[]): number[] => [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const sub = (p: number[], q: number[]): number[] => p.map((c, i) => c - q[i]!);
    const faceA = cross(sub(v1, v0), sub(v2, v0));
    const faceB = cross(sub(v3, v0), sub(v2, v0));
    const sum = faceA.map((c, i) => c + faceB[i]!);
    const len = Math.hypot(...sum);
    const expected = sum.map((c) => c / len);

    expect(normals[0]).toBeCloseTo(expected[0]!, 6);
    expect(normals[1]).toBeCloseTo(expected[1]!, 6);
    expect(normals[2]).toBeCloseTo(expected[2]!, 6);
  });

  it('a degenerate zero-area triangle contributes nothing and yields no NaN', () => {
    // Real quad (0,1,2)/(0,2,3), plus a degenerate triangle (0,4,1) where
    // vertex 4 is coincident with vertex 0.
    const v0 = [0, 0, 0];
    const v1 = [1, 0, 0];
    const v2 = [1, 1, 0];
    const v3 = [0, 1, 0];
    const v4 = v0; // coincident with vertex 0
    const positions = new Float32Array([...v0, ...v1, ...v2, ...v3, ...v4]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 0, 4, 1]);

    const normals = computeSmoothNormals(positions, indices);

    for (const value of normals) expect(Number.isNaN(value)).toBe(false);
    // Vertex 0's normal is unaffected by the degenerate face: still +Z, same
    // as the flat-quad case.
    expect(normals[0]).toBeCloseTo(0, 6);
    expect(normals[1]).toBeCloseTo(0, 6);
    expect(normals[2]).toBeCloseTo(1, 6);
  });
});
