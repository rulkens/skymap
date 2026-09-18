/**
 * refineMeshByEdgeLength.test.ts — the crack-free invariant, first and foremost.
 *
 * Adaptive refinement's classic failure is the T-junction: a split edge whose
 * neighbour did not split leaves a hairline gap that, on an additively blended
 * shell, reads as a dark seam through the surface. On a closed mesh that shows
 * up as an edge used by one face instead of two, which is what the first test
 * asserts — it is the reason the split decision reads only an edge's endpoints.
 */
import { describe, expect, it } from 'vitest';

import { refineMeshByEdgeLength } from '../../../../tools/utils/geo/refineMeshByEdgeLength';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

/** Unit octahedron — a closed triangle mesh small enough to reason about. */
function octahedron(): {
  directions: Vec3[];
  faces: [number, number, number][];
} {
  return {
    directions: [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    faces: [
      [0, 2, 4],
      [2, 1, 4],
      [1, 3, 4],
      [3, 0, 4],
      [2, 0, 5],
      [1, 2, 5],
      [3, 1, 5],
      [0, 3, 5],
    ],
  };
}

function edgeUseCounts(faces: readonly (readonly [number, number, number])[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [a, b, c] of faces) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = p! < q! ? `${p}_${q}` : `${q}_${p}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function longestEdge(
  mesh: { directions: readonly Vec3[]; faces: readonly (readonly [number, number, number])[] },
  radiusOf: (d: Vec3) => number,
): number {
  let worst = 0;
  for (const [a, b, c] of mesh.faces) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const dp = mesh.directions[p!]!;
      const dq = mesh.directions[q!]!;
      const rp = radiusOf(dp);
      const rq = radiusOf(dq);
      worst = Math.max(
        worst,
        Math.hypot(dp[0] * rp - dq[0] * rq, dp[1] * rp - dq[1] * rq, dp[2] * rp - dq[2] * rq),
      );
    }
  }
  return worst;
}

describe('refineMeshByEdgeLength', () => {
  it('leaves no T-junction: every edge stays shared by exactly two faces', () => {
    const { directions, faces } = octahedron();
    // A radius that spikes over one hemisphere, so refinement is strongly
    // uneven — a uniform field would not exercise the conformity logic at all.
    const radiusOf = (d: Vec3): number => (d[2]! > 0 ? 500 : 100);

    const mesh = refineMeshByEdgeLength(directions, faces, radiusOf, 20, 6, 200000);

    for (const [edge, uses] of edgeUseCounts(mesh.faces)) {
      expect(`${edge}:${uses}`).toBe(`${edge}:2`);
    }
  });

  it('brings every displaced edge under the target', () => {
    const { directions, faces } = octahedron();
    const radiusOf = (d: Vec3): number => 200 + 100 * d[2]!;

    const mesh = refineMeshByEdgeLength(directions, faces, radiusOf, 15, 10, 500000);

    expect(longestEdge(mesh, radiusOf)).toBeLessThanOrEqual(15);
  });

  it('does no work when the mesh already meets the target', () => {
    const { directions, faces } = octahedron();
    const mesh = refineMeshByEdgeLength(directions, faces, () => 1, 100, 6, 200000);

    expect(mesh.faces.length).toBe(faces.length);
    expect(mesh.directions.length).toBe(directions.length);
  });

  it('refines the far side harder than the near side', () => {
    const { directions, faces } = octahedron();
    const radiusOf = (d: Vec3): number => (d[2]! > 0 ? 600 : 80);

    const mesh = refineMeshByEdgeLength(directions, faces, radiusOf, 25, 6, 200000);

    const north = mesh.faces.filter((f) => f.every((i) => mesh.directions[i]![2]! > 0.01)).length;
    const south = mesh.faces.filter((f) => f.every((i) => mesh.directions[i]![2]! < -0.01)).length;
    expect(north).toBeGreaterThan(south * 2);
  });

  it('stops at the face budget', () => {
    const { directions, faces } = octahedron();
    const mesh = refineMeshByEdgeLength(directions, faces, () => 400, 1, 20, 5000);

    expect(mesh.faces.length).toBeLessThan(40000);
  });
});
