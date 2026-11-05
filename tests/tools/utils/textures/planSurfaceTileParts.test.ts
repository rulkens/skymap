import { expect, it } from 'vitest';

import { planSurfaceTileParts } from '../../../../tools/utils/textures/planSurfaceTileParts';

it('fills a part to exactly maxPartBytes before opening the next', () => {
  const { entries, partCount } = planSurfaceTileParts(
    [
      { key: 0, length: 60 },
      { key: 1, length: 40 },
      { key: 2, length: 1 },
    ],
    100,
  );
  expect(entries.map((e) => [e.part, e.offset])).toEqual([
    [0, 0],
    [0, 60],
    [1, 0],
  ]);
  expect(partCount).toBe(2);
});

it('throws on a single tile larger than a part', () => {
  expect(() => planSurfaceTileParts([{ key: 0, length: 101 }], 100)).toThrow(/part cap/);
});
