/**
 * The one gate every outline passes (endpoint PUT, `crop-mesh` read): the
 * `MeshOutline` invariants, enforced. Messages are user-facing — the endpoint
 * returns them as the 400 body.
 */
import { segmentsTouch } from './segmentsTouch';
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
