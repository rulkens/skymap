import { describe, expect, it } from 'vitest';
import { STRUCTURE_VISIBLE_BANDS_BY_SCALE } from '../../../../src/services/engine/presentation/structureVisibleBands';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import { fadeBand } from '../../../../src/utils/math/fadeBand';

describe('structure visible bands by scale', () => {
  it('a Milky Way category is full at the Sun and gone at the foreground gate', () => {
    for (const band of STRUCTURE_VISIBLE_BANDS_BY_SCALE.milkyWay) {
      expect(fadeBand(band, 0)).toBe(1);
      expect(fadeBand(band, FOREGROUND_MAX_DISTANCE_MPC)).toBe(0);
    }
  });
});
