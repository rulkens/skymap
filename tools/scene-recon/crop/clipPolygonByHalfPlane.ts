/**
 * One Sutherland–Hodgman pass in 3D against a vertical plane: distance from XY
 * only, so a wall crossing the outline is cut like a floor. Cut vertices are
 * keyed and lerped from the lexically lower endpoint, so both triangles on a
 * shared edge produce the same key and bit-identical attributes.
 */
import type { ClipVertex } from '../@types/ClipVertex';
import type { HalfPlane2 } from '../@types/HalfPlane2';

export function clipPolygonByHalfPlane(
  polygon: readonly ClipVertex[],
  plane: HalfPlane2,
  planeKey: string,
): ClipVertex[] {
  const distance = (v: ClipVertex) =>
    plane.normal[0] * v.positionM[0] + plane.normal[1] * v.positionM[1] - plane.offset;
  const out: ClipVertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    const dCurrent = distance(current);
    const dNext = distance(next);
    if (dCurrent >= 0) out.push(current);
    if ((dCurrent < 0 && dNext > 0) || (dCurrent > 0 && dNext < 0)) {
      out.push(cutVertex(current, dCurrent, next, dNext, planeKey));
    }
  }
  return out;
}

function cutVertex(
  p: ClipVertex,
  dP: number,
  q: ClipVertex,
  dQ: number,
  planeKey: string,
): ClipVertex {
  const [a, dA, b, dB] = p.key < q.key ? [p, dP, q, dQ] : [q, dQ, p, dP];
  const t = dA / (dA - dB);
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    positionM: [
      lerp(a.positionM[0], b.positionM[0]),
      lerp(a.positionM[1], b.positionM[1]),
      lerp(a.positionM[2], b.positionM[2]),
    ],
    uv: [lerp(a.uv[0], b.uv[0]), lerp(a.uv[1], b.uv[1])],
    key: `${a.key}|${b.key}|${planeKey}`,
  };
}
