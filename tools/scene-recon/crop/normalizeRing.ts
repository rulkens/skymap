/**
 * The one gate every outline passes (endpoint PUT, `crop-mesh` read): the
 * `MeshOutline` invariants, enforced. Messages are user-facing — the endpoint
 * returns them as the 400 body.
 */
import type { Vec2 } from '../../../src/@types/math/Vec2';

export function normalizeRing(ringM: readonly Vec2[]): Vec2[] {
  const ring = ringM.map(([x, y]): Vec2 => [x, y]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first![0] === last![0] && first![1] === last![1]) ring.pop();

  if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error('outline: every corner needs finite x and y');
  }
  if (new Set(ring.map(([x, y]) => `${x},${y}`)).size < 3) {
    throw new Error('outline: needs at least three distinct corners');
  }

  const n = ring.length;
  for (let i = 0; i < n; i++) {
    // j stops before i's predecessor, so adjacent edges (which share a corner) are skipped.
    for (let j = i + 2; j < n - (i === 0 ? 1 : 0); j++) {
      if (segmentsTouch(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) {
        throw new Error(`outline: edges ${i} and ${j} intersect — the ring must be simple`);
      }
    }
  }

  let twiceArea = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % n]!;
    twiceArea += ax * by - bx * ay;
  }
  if (twiceArea === 0) throw new Error('outline: the ring encloses no area');
  return twiceArea < 0 ? ring.reverse() : ring;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Inclusive: a corner resting on a non-adjacent edge makes the ring non-simple too. */
function segmentsTouch(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  const onSegment = (p: Vec2, q: Vec2, r: Vec2) =>
    Math.min(p[0], q[0]) <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) &&
    Math.min(p[1], q[1]) <= r[1] &&
    r[1] <= Math.max(p[1], q[1]);
  return (
    (d1 === 0 && onSegment(c, d, a)) ||
    (d2 === 0 && onSegment(c, d, b)) ||
    (d3 === 0 && onSegment(a, b, c)) ||
    (d4 === 0 && onSegment(a, b, d))
  );
}
