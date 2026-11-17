import { describe, it, expect } from 'vitest';
import { opticalCentrePx } from '../../../../../../../../src/services/engine/camera/arms/body/gesture/utils/opticalCentrePx';

describe('opticalCentrePx', () => {
  it('follows a shifted window', () => {
    const shifted = { tanLeft: -1, tanRight: 3, tanDown: -1, tanUp: 1 };
    expect(opticalCentrePx(shifted, [400, 200])).toEqual([100, 100]);
  });
});
