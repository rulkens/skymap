import { describe, it, expect } from 'vitest';
import { diskQuadExtentMpc } from '../../../../src/utils/render/disk/diskQuadExtentMpc';
import { paddedRadiusMpc } from '../../../../src/utils/paddedRadiusMpc';

describe('diskQuadExtentMpc', () => {
  it('is twice the padded radius (full quad extent)', () => {
    for (const dKpc of [10, 30, 75, 150]) {
      expect(diskQuadExtentMpc(dKpc)).toBe(paddedRadiusMpc(dKpc) * 2);
    }
  });
});
