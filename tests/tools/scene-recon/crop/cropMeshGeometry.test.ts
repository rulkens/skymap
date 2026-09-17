import { describe, expect, it } from 'vitest';

import { cropMeshGeometry } from '../../../../tools/scene-recon/crop/cropMeshGeometry';
import { triangulateOutline } from '../../../../tools/scene-recon/crop/triangulateOutline';
import type { TexturedMeshGeometry } from '../../../../tools/scene-recon/pack/packMeshGlb';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const UNIT_SQUARE: Vec2[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const IMAGE = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' } as const;

/** One vertex per triangle corner, uv defaulting to the corner's XY. */
function geometry(triangles: readonly (readonly [Vec3, Vec2?])[][]): TexturedMeshGeometry {
  const corners = triangles.flat();
  return {
    positions: new Float32Array(corners.flatMap(([p]) => p)),
    uvs: new Float32Array(corners.flatMap(([p, uv]) => uv ?? [p[0], p[1]])),
    indices: Uint32Array.from(corners.keys()),
    image: IMAGE,
  };
}

function crop(source: TexturedMeshGeometry, ring: Vec2[] = UNIT_SQUARE): TexturedMeshGeometry {
  return cropMeshGeometry(source, ring, triangulateOutline(ring));
}

function vertex(g: TexturedMeshGeometry, i: number): Vec3 {
  return [g.positions[3 * i]!, g.positions[3 * i + 1]!, g.positions[3 * i + 2]!];
}

function xyArea(g: TexturedMeshGeometry): number {
  let area = 0;
  for (let t = 0; t < g.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => vertex(g, g.indices[t + k]!));
    area += Math.abs((b![0] - a![0]) * (c![1] - a![1]) - (b![1] - a![1]) * (c![0] - a![0])) / 2;
  }
  return area;
}

describe('cropMeshGeometry', () => {
  it('keeps a fully inside triangle with its indices untouched', () => {
    const source = geometry([[[[0.2, 0.2, 3]], [[0.4, 0.2, 3]], [[0.3, 0.4, 5]]]]);

    const out = crop(source);

    expect(Array.from(out.positions)).toEqual(Array.from(source.positions));
    expect(Array.from(out.indices)).toEqual([0, 1, 2]);
    expect(out.image).toBe(source.image);
  });

  it('drops a fully outside triangle and compacts its vertices', () => {
    const source = geometry([
      [[[2, 2, 0]], [[3, 2, 0]], [[2, 3, 0]]],
      [[[0.2, 0.2, 3]], [[0.4, 0.2, 3]], [[0.3, 0.4, 5]]],
    ]);

    const out = crop(source);

    expect(Array.from(out.positions)).toEqual(Array.from(source.positions.subarray(9)));
    expect(Array.from(out.uvs)).toEqual(Array.from(source.uvs.subarray(6)));
    expect(Array.from(out.indices)).toEqual([0, 1, 2]);
  });

  it('clips a triangle crossing one edge to the analytic area and UV', () => {
    const source = geometry([
      [
        [
          [-1, 0.2, 0],
          [0, 0],
        ],
        [
          [0.5, 0.2, 0],
          [1, 0],
        ],
        [
          [0.5, 0.8, 0],
          [1, 1],
        ],
      ],
    ]);

    const out = crop(source);

    // The kept part is the trapezoid x ∈ [0, 0.5] under the edge y = 0.2 + 0.4·(x + 1).
    expect(xyArea(out)).toBeCloseTo(0.25, 6);
    const vertexCount = out.positions.length / 3;
    const cut = [...Array(vertexCount).keys()].find((i) => {
      const [x, y] = vertex(out, i);
      return Math.abs(x) < 1e-6 && Math.abs(y - 0.6) < 1e-6;
    });
    expect(cut).toBeDefined();
    expect(out.uvs[2 * cut!]).toBeCloseTo(0.666667, 5);
    expect(out.uvs[2 * cut! + 1]).toBeCloseTo(0.666667, 5);
  });

  it('drops a triangle inside a concave notch’s bbox but outside the ring', () => {
    const u: Vec2[] = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ];
    const source = geometry([[[[1.2, 1.5, 0]], [[1.8, 1.5, 0]], [[1.5, 2.5, 0]]]]);

    const out = crop(source, u);

    expect(out.indices.length).toBe(0);
    expect(out.positions.length).toBe(0);
  });

  it('clips a vertical triangle crossing the boundary', () => {
    const source = geometry([[[[-1, 0.3, 0]], [[0.6, 0.3, 0]], [[0.6, 0.3, 10]]]]);

    const out = crop(source);

    const kept = [...Array(out.positions.length / 3).keys()].map((i) => vertex(out, i));
    expect(Math.min(...kept.map(([x]) => x))).toBeCloseTo(0, 6);
    expect(Math.min(...kept.map(([, , z]) => z))).toBe(0);
    expect(Math.max(...kept.map(([, , z]) => z))).toBe(10);
    // The cut along A→C at x = 0: t = 1/1.6, so z = 6.25.
    const onBoundaryZ = kept.filter(([x]) => Math.abs(x) < 1e-6).map(([, , z]) => z);
    expect(onBoundaryZ.some((z) => Math.abs(z - 6.25) < 1e-5)).toBe(true);
  });

  it('two triangles sharing a cut edge reuse one new vertex', () => {
    const a: [Vec3] = [[-1, 0.4, 0]];
    const b: [Vec3] = [[0.5, 0.4, 0]];
    // Shared edge a–b through indices, not duplicated corners.
    const source: TexturedMeshGeometry = {
      ...geometry([[a, b, [[0.5, 0.8, 0]]], [[[-0.5, 0.1, 0]]]]),
      indices: new Uint32Array([0, 1, 2, 1, 0, 3]),
    };

    const out = crop(source);

    const atCut = [...Array(out.positions.length / 3).keys()].filter((i) => {
      const [x, y] = vertex(out, i);
      return Math.abs(x) < 1e-6 && Math.abs(y - 0.4) < 1e-6;
    });
    expect(atCut).toHaveLength(1);
  });

  it('clips a triangle whose edge enters the outline only through ring corners', () => {
    // A V notch whose mouth corners (1, 2) and (3, 2) sit on the triangle's top edge: no
    // proper crossing anywhere, all three corners inside, yet the V (area 1) is outside.
    const notched: Vec2[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [3, 4],
      [3, 2],
      [2, 1],
      [1, 2],
      [1, 4],
      [0, 4],
    ];
    const source = geometry([[[[0.5, 2, 0]], [[2, 0.5, 0]], [[3.5, 2, 0]]]]);

    const out = crop(source, notched);

    expect(xyArea(out)).toBeCloseTo(1.25, 6);
  });
});
