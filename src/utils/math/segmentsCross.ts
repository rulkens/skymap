/** segmentsCross — whether segments ab and pq properly cross (each pair of ends on opposite sides of the other's line). */

import type { Vec2 } from '../../@types/math/Vec2';

export function segmentsCross(
  a: Readonly<Vec2>,
  b: Readonly<Vec2>,
  p: Readonly<Vec2>,
  q: Readonly<Vec2>,
): boolean {
  const side = (o: Readonly<Vec2>, s: Readonly<Vec2>, t: Readonly<Vec2>) =>
    Math.sign((s[0] - o[0]) * (t[1] - o[1]) - (s[1] - o[1]) * (t[0] - o[0]));
  return side(a, b, p) !== side(a, b, q) && side(p, q, a) !== side(p, q, b);
}
