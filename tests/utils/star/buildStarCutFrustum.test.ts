import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { buildStarCutFrustum } from '../../../src/utils/star/buildStarCutFrustum';

function vpAt(eye: readonly [number, number, number]): Float32Array {
  const proj = mat4.perspective(Math.PI / 3, 1, 1, 100);
  const view = mat4.lookAt(eye, [eye[0], eye[1], eye[2] - 1], [0, 1, 0]);
  return mat4.multiply(proj, view) as Float32Array;
}

describe('buildStarCutFrustum', () => {
  it("a narrower call's planesPc is bounded by its own length — a wider earlier call on the same grow-only scratch leaves no stale planes reachable", () => {
    // `planesPc` is a `subarray` sized to exactly this call's plane count, so
    // `length` is the truth directly — a walk bounding on it can never union
    // against a previous, wider call's leftover planes on the shared
    // grow-only buffer.
    const wide = buildStarCutFrustum(
      [vpAt([0, 0, 0]), vpAt([1, 0, 0]), vpAt([2, 0, 0])],
      1000,
      800,
      1,
    )!;
    expect(wide.planesPc.length).toBe(3 * 24);

    const narrow = buildStarCutFrustum([vpAt([5, 5, 5])], 1000, 800, 1)!;
    expect(narrow.planesPc.length).toBe(24);
  });

  it('returns null for zero views', () => {
    expect(buildStarCutFrustum([], 1000, 800, 1)).toBeNull();
  });
});
