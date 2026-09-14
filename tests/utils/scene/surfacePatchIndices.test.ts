import { describe, it, expect } from 'vitest';

import { surfacePatchIndices } from '../../../src/utils/scene/surfacePatchIndices';

const RESOLUTION = 8;

function toIJ(vid: number, row: number): [number, number] {
  return [vid % row, Math.floor(vid / row)];
}

describe('surfacePatchIndices', () => {
  it('winds every triangle CCW in the (i, j) parametric plane', () => {
    const row = RESOLUTION + 1;
    const indices = surfacePatchIndices(RESOLUTION);
    for (let t = 0; t < indices.length; t += 3) {
      const [i0, j0] = toIJ(indices[t]!, row);
      const [i1, j1] = toIJ(indices[t + 1]!, row);
      const [i2, j2] = toIJ(indices[t + 2]!, row);
      const cross = (i1 - i0) * (j2 - j0) - (j1 - j0) * (i2 - i0);
      expect(cross).toBeGreaterThan(0);
    }
  });

  it('covers the grid', () => {
    const indices = surfacePatchIndices(RESOLUTION);
    const maxVertex = (RESOLUTION + 1) * (RESOLUTION + 1) - 1;
    expect(indices.length).toBe(6 * RESOLUTION * RESOLUTION);
    for (const vid of indices) {
      expect(vid).toBeLessThanOrEqual(maxVertex);
    }
  });
});
