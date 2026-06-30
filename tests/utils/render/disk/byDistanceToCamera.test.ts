import { describe, it, expect } from 'vitest';
import { byDistanceToCamera } from '../../../../src/utils/render/disk/byDistanceToCamera';

const at = (x: number, y: number, z: number) => ({ x, y, z });

describe('byDistanceToCamera', () => {
  it('sorts farthest-first (back-to-front) for alpha compositing', () => {
    const cmp = byDistanceToCamera([0, 0, 0]);
    const near = at(1, 0, 0);
    const mid = at(5, 0, 0);
    const far = at(10, 0, 0);
    const sorted = [near, far, mid].sort(cmp);
    expect(sorted).toEqual([far, mid, near]);
  });

  it('measures distance from the given camera position, not the origin', () => {
    const cmp = byDistanceToCamera([10, 0, 0]);
    const a = at(9, 0, 0); // 1 from camera
    const b = at(0, 0, 0); // 10 from camera
    expect(cmp(a, b)).toBeGreaterThan(0); // b farther → a sorts after b
  });

  it('returns 0 for equal distances', () => {
    const cmp = byDistanceToCamera([0, 0, 0]);
    expect(cmp(at(3, 0, 0), at(0, 3, 0))).toBe(0);
  });
});
