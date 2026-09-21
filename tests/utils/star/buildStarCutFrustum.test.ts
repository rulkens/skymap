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
    // K9: `viewCount` used to be the only thing telling a consumer where the
    // live data ends on the shared grow-only buffer; a walk that read
    // `planesPc.length` instead would union against a previous, wider call's
    // leftover planes. The `subarray` view makes `length` the truth directly.
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
