/**
 * icosphere — uniformly subdivided icosahedron: the base mesh a caller
 * refines further (e.g. `refineMeshByEdgeLength`) once a displacement field
 * is known.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { normalize3 } from '../../../src/utils/math/normalize3';

export type Icosphere = {
  directions: Vec3[];
  faces: [number, number, number][];
};

export function icosphere(subdivisions: number): Icosphere {
  const t = (1 + Math.sqrt(5)) / 2;
  const directions: Vec3[] = (
    [
      [-1, t, 0],
      [1, t, 0],
      [-1, -t, 0],
      [1, -t, 0],
      [0, -1, t],
      [0, 1, t],
      [0, -1, -t],
      [0, 1, -t],
      [t, 0, -1],
      [t, 0, 1],
      [-t, 0, -1],
      [-t, 0, 1],
    ] as Vec3[]
  ).map(normalize3);
  let faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let s = 0; s < subdivisions; s++) {
    const cache = new Map<string, number>();
    const next: [number, number, number][] = [];
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const va = directions[a]!;
      const vb = directions[b]!;
      directions.push(normalize3([va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]]));
      cache.set(key, directions.length - 1);
      return directions.length - 1;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { directions, faces };
}
