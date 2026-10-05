import type { Vec3 } from '../../../src/@types/math/Vec3';
import { normalize3 } from '../../../src/utils/math/normalize3';

/**
 * Area-weighted vertex normals. Flat face normals leave a Fresnel term that
 * jumps at every edge no matter how fine the mesh — this is what the real
 * pass interpolates per pixel.
 */
export function vertexNormals(
  positions: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
): Vec3[] {
  const normals: Vec3[] = positions.map(() => [0, 0, 0]);
  for (const [a, b, c] of faces) {
    const pa = positions[a]!;
    const pb = positions[b]!;
    const pc = positions[c]!;
    const e1: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const e2: Vec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    // Un-normalized cross product: its length is twice the face area, which is
    // exactly the weight a smooth normal wants.
    const n: Vec3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    for (const i of [a, b, c]) {
      normals[i]![0] += n[0];
      normals[i]![1] += n[1];
      normals[i]![2] += n[2];
    }
  }
  return normals.map(normalize3);
}
