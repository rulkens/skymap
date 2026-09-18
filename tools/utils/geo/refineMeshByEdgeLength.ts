/**
 * refineMeshByEdgeLength — adaptive refinement of a unit-sphere triangle mesh
 * until every DISPLACED edge is under a target length.
 *
 * One criterion covers both reasons a shell's triangles get too big: a far
 * region (the chimney at 536 pc) stretches a fixed angular edge into a long
 * one, and a steep radial slope puts an edge's two ends at very different
 * radii. Both show up as displaced edge length, so neither needs its own rule.
 *
 * Conformal BY CONSTRUCTION, with no closure pass and no cascade: the split
 * decision for an edge reads only that edge's two endpoints, so the two faces
 * sharing it always decide alike. Each face then splits on whichever of its
 * three edges were marked (1 → 2 faces, 2 → 3, 3 → 4), which is why the
 * two-edge case picks a diagonal — that choice is interior to the face and
 * cannot disagree with a neighbour.
 *
 * Uniform subdivision is the alternative and it is not competitive here: the
 * Local Bubble's edge lengths span 20× between median and max, so matching the
 * tail uniformly costs ~21M triangles against a few hundred thousand.
 */

import type { Vec3 } from '../../../src/@types/math/Vec3';

export type RefinedMesh = {
  /** Unit direction per vertex; the caller re-derives radius from its own field. */
  readonly directions: readonly Vec3[];
  readonly faces: readonly (readonly [number, number, number])[];
};

export function refineMeshByEdgeLength(
  directions: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
  radiusOf: (dir: Vec3) => number,
  targetLengthPc: number,
  maxPasses: number,
  maxFaces: number,
): RefinedMesh {
  let verts: Vec3[] = directions.map((d) => [...d] as Vec3);
  let tris: [number, number, number][] = faces.map((f) => [...f] as [number, number, number]);

  for (let pass = 0; pass < maxPasses; pass++) {
    const radii = verts.map(radiusOf);
    const midpointOf = new Map<string, number>();

    const needsSplit = (a: number, b: number): boolean => {
      const ra = radii[a]!;
      const rb = radii[b]!;
      const va = verts[a]!;
      const vb = verts[b]!;
      const dx = va[0] * ra - vb[0] * rb;
      const dy = va[1] * ra - vb[1] * rb;
      const dz = va[2] * ra - vb[2] * rb;
      return Math.hypot(dx, dy, dz) > targetLengthPc;
    };

    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = midpointOf.get(key);
      if (hit !== undefined) return hit;
      const va = verts[a]!;
      const vb = verts[b]!;
      const mx = va[0] + vb[0];
      const my = va[1] + vb[1];
      const mz = va[2] + vb[2];
      const n = Math.hypot(mx, my, mz) || 1;
      verts.push([mx / n, my / n, mz / n]);
      const index = verts.length - 1;
      midpointOf.set(key, index);
      return index;
    };

    const next: [number, number, number][] = [];
    let splits = 0;
    for (const [a, b, c] of tris) {
      const ab = needsSplit(a, b);
      const bc = needsSplit(b, c);
      const ca = needsSplit(c, a);
      const count = (ab ? 1 : 0) + (bc ? 1 : 0) + (ca ? 1 : 0);
      if (count === 0) {
        next.push([a, b, c]);
        continue;
      }
      splits++;
      if (count === 3) {
        const mab = midpoint(a, b);
        const mbc = midpoint(b, c);
        const mca = midpoint(c, a);
        next.push([a, mab, mca], [b, mbc, mab], [c, mca, mbc], [mab, mbc, mca]);
      } else if (count === 1) {
        // Bisect the marked edge to the opposite corner.
        if (ab) splitOne(next, a, b, c, midpoint(a, b));
        else if (bc) splitOne(next, b, c, a, midpoint(b, c));
        else splitOne(next, c, a, b, midpoint(c, a));
      } else {
        // Two marked edges meet at a corner; the third corner takes the fan.
        if (!ca) splitTwo(next, a, b, c, midpoint(a, b), midpoint(b, c), verts);
        else if (!ab) splitTwo(next, b, c, a, midpoint(b, c), midpoint(c, a), verts);
        else splitTwo(next, c, a, b, midpoint(c, a), midpoint(a, b), verts);
      }
    }

    tris = next;
    if (splits === 0) break;
    if (tris.length >= maxFaces) break;
  }

  return { directions: verts, faces: tris };
}

/** Edge (a,b) is split at m; c is the opposite corner. */
function splitOne(
  out: [number, number, number][],
  a: number,
  b: number,
  c: number,
  m: number,
): void {
  out.push([a, m, c], [m, b, c]);
}

/**
 * Edges (a,b) and (b,c) are split at mab/mbc; `a` is the untouched corner. The
 * quad a–mab–mbc–c takes whichever diagonal is shorter, which keeps the two
 * halves from degenerating into slivers.
 */
function splitTwo(
  out: [number, number, number][],
  a: number,
  b: number,
  c: number,
  mab: number,
  mbc: number,
  verts: readonly Vec3[],
): void {
  out.push([mab, b, mbc]);
  const dAtoMbc = chordSq(verts[a]!, verts[mbc]!);
  const dCtoMab = chordSq(verts[c]!, verts[mab]!);
  if (dAtoMbc <= dCtoMab) out.push([a, mab, mbc], [a, mbc, c]);
  else out.push([a, mab, c], [mab, mbc, c]);
}

function chordSq(p: Vec3, q: Vec3): number {
  const dx = p[0] - q[0];
  const dy = p[1] - q[1];
  const dz = p[2] - q[2];
  return dx * dx + dy * dy + dz * dz;
}
