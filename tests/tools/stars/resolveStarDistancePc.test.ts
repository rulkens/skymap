import { describe, expect, it } from 'vitest';
import { resolveStarDistancePc } from '../../../tools/stars/resolveStarDistancePc';

describe('resolveStarDistancePc', () => {
  it('prefers photogeo, then geo, then GCNS', () => {
    // Sentinel values are distinct so each assertion proves WHICH branch won,
    // not just that some non-null number came back.
    expect(
      resolveStarDistancePc({ rMedPhotogeo: 111, rMedGeo: 222, gcnsDistPc: 333 })
    ).toBe(111);

    expect(
      resolveStarDistancePc({ rMedPhotogeo: null, rMedGeo: 222, gcnsDistPc: 333 })
    ).toBe(222);

    expect(
      resolveStarDistancePc({ rMedPhotogeo: null, rMedGeo: null, gcnsDistPc: 333 })
    ).toBe(333);
  });

  it('returns null when no distance is available', () => {
    expect(
      resolveStarDistancePc({ rMedPhotogeo: null, rMedGeo: null, gcnsDistPc: null })
    ).toBeNull();
  });
});
