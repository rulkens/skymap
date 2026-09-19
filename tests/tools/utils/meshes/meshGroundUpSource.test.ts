import { describe, it, expect } from 'vitest';

import { meshGroundUpSource } from '../../../../tools/utils/meshes/meshGroundUpSource';

describe('meshGroundUpSource', () => {
  it('the rovers bake against a ground whose up is source +Y', () => {
    for (const key of ['curiosity', 'perseverance', 'mer']) {
      const up = meshGroundUpSource(key);
      expect(up).toBeDefined();
      const [x, y, z] = up as [number, number, number];
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(1);
      expect(z).toBeCloseTo(0);
    }
  });

  it('a floating mesh bakes with no ground', () => {
    for (const key of ['voyager', 'hubble']) {
      expect(meshGroundUpSource(key)).toBeUndefined();
    }
  });
});
