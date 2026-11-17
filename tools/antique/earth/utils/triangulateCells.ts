/**
 * triangulateCells — cells as fill triangles on the unit globe, every vertex
 * carrying its cell's colour code (cells coded 0 are left out: no triangle
 * already reads as no realm). Each polygon goes through
 * `triangulateSphericalPolygon`, whose edge-only split rule keeps two cells'
 * shared edge split alike, so no hairline of code 0 opens between them.
 */

import type { BakedFill } from '../@types/BakedFill';
import type { RealmCell } from '../@types/RealmCell';
import { triangulateSphericalPolygon } from './triangulateSphericalPolygon';

export function triangulateCells(
  cells: readonly RealmCell[],
  codeOf: (key: string) => number,
  maxEdgeDeg: number,
): BakedFill {
  const positions: number[] = [];
  const codes: number[] = [];
  const indices: number[] = [];
  for (const cell of cells) {
    const code = codeOf(cell.key);
    if (code === 0) continue;
    for (const rings of cell.polygons) {
      // GeoJSON rings repeat their first point last; earcut wants each vertex once.
      const [outer, ...holes] = rings.map((ring) => ring.slice(0, -1));
      if (outer!.length < 3) continue;
      const mesh = triangulateSphericalPolygon([outer!, ...holes.filter((h) => h.length >= 3)], maxEdgeDeg);
      const base = codes.length;
      for (const p of mesh.positions) {
        positions.push(p[0], p[1], p[2]);
        codes.push(code);
      }
      for (const i of mesh.indices) indices.push(base + i);
    }
  }
  return {
    positions: new Float32Array(positions),
    codes: new Uint8Array(codes),
    indices: new Uint32Array(indices),
  };
}
