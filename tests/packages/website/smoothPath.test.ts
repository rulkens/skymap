import { expect, it } from 'vitest';

import { smoothPath } from '../../../packages/website/src/utils/smoothPath';

// The line in Places must pass through every disc centre, so each curve has to end on its point.
it('smoothPath starts on the first point and ends every curve on the next', () => {
  const d = smoothPath([
    [0, 0],
    [10, 40],
    [30, 5],
  ]);
  expect(d.startsWith('M0 0')).toBe(true);
  const ends = [...d.matchAll(/C[^C]*? (-?[\d.]+) (-?[\d.]+)(?= C|$)/g)].map((m) => [
    +m[1]!,
    +m[2]!,
  ]);
  expect(ends).toEqual([
    [10, 40],
    [30, 5],
  ]);
});
