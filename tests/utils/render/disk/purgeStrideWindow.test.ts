import { describe, it, expect } from 'vitest';
import { purgeStrideWindow } from '../../../../src/utils/render/disk/purgeStrideWindow';

describe('purgeStrideWindow', () => {
  it('deletes only the keys inside [safeStart, end)', () => {
    const m = new Map<number, string>([
      [0, 'a'],
      [3, 'b'],
      [5, 'c'],
      [7, 'd'],
      [9, 'e'],
    ]);
    purgeStrideWindow(m, 3, 8); // drops 3, 5, 7 — keeps 0 and 9
    expect([...m.keys()].sort((x, y) => x - y)).toEqual([0, 9]);
  });

  it('is a no-op when no key falls in the window', () => {
    const m = new Map<number, number>([
      [0, 1],
      [10, 2],
    ]);
    purgeStrideWindow(m, 3, 8);
    expect(m.size).toBe(2);
  });

  it('end is exclusive', () => {
    const m = new Map<number, number>([[8, 1]]);
    purgeStrideWindow(m, 3, 8);
    expect(m.has(8)).toBe(true);
  });
});
