import { describe, expect, it } from 'vitest';

import { normalizeRing } from '../../../../tools/scene-recon/crop/normalizeRing';

describe('normalizeRing', () => {
  it('normalizeRing reverses a clockwise ring', () => {
    expect(
      normalizeRing([
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ]),
    ).toEqual([
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });

  it('normalizeRing drops a repeated closing corner', () => {
    expect(
      normalizeRing([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  it('normalizeRing rejects fewer than three corners', () => {
    expect(() =>
      normalizeRing([
        [0, 0],
        [1, 0],
        [0, 0],
      ]),
    ).toThrow(/three/);
  });

  it('normalizeRing rejects a bow-tie', () => {
    expect(() =>
      normalizeRing([
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 1],
      ]),
    ).toThrow(/intersect/);
  });
});
