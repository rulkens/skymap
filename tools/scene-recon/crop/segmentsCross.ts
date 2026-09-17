import type { Vec2 } from '../../../src/@types/math/Vec2';

/** Proper crossing only: touching or collinear overlap is not a crossing. */
export function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const side = (o: Vec2, p: Vec2, q: Vec2) =>
    Math.sign((p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]));
  return side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
}
