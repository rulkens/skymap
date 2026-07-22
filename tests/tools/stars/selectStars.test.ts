import { describe, expect, it } from 'vitest';
import {
  selectStars,
  type GaiaSelectedRow,
  type HipBrightRow,
} from '../../../tools/stars/selectStars';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Distinct sentinel positions/colours so an assertion proves WHICH row survived,
// not merely that some star came through.
const gaiaRow = (sourceId: bigint, tag: number): GaiaSelectedRow => ({
  sourceId,
  position: [tag, tag, tag] as Vec3,
  absMag: tag,
  bpRp: tag / 10,
  appMag: tag,
  isSupplement: false,
});

const brightRow = (hip: number, tag: number): HipBrightRow => ({
  hip,
  position: [tag, tag, tag] as Vec3,
  absMag: tag,
  bpRp: tag / 10,
  appMag: tag,
  isSupplement: false,
});

describe('selectStars', () => {
  it('subtracts Hipparcos-matched Gaia rows and lets the bright row replace them', () => {
    const gaia = [gaiaRow(1000n, 1)];
    const hipparcosBright = [brightRow(42, 9)];
    const hipToSourceId = new Map<number, bigint>([[42, 1000n]]);

    const { stars, drops } = selectStars({
      gaia,
      hipparcosBright,
      hipToSourceId,
      famousGaiaIds: new Set(),
      famousHipIds: new Set(),
    });

    // The Gaia row (tag 1) is gone; the bright row (tag 9) stands in for it.
    expect(stars).toHaveLength(1);
    expect(stars[0]?.absMag).toBe(9);
    expect(drops.hipGaiaSubtracted).toBe(1);
    expect(drops.famousSubtracted).toBe(0);
  });

  it('subtracts famous-star Gaia rows and keeps Gaia rows absent from the famous set', () => {
    const gaia = [gaiaRow(2000n, 2), gaiaRow(3000n, 3)];

    const { stars, drops } = selectStars({
      gaia,
      hipparcosBright: [],
      hipToSourceId: new Map(),
      // The set holds only non-null ids; 3000n is simply not famous and survives.
      famousGaiaIds: new Set([2000n]),
      famousHipIds: new Set(),
    });

    expect(stars).toHaveLength(1);
    expect(stars[0]?.absMag).toBe(3);
    expect(drops.famousSubtracted).toBe(1);
    expect(drops.hipGaiaSubtracted).toBe(0);
  });

  it('unions Hipparcos-bright rows that Gaia lacks', () => {
    const { stars, drops } = selectStars({
      gaia: [gaiaRow(4000n, 4)],
      hipparcosBright: [brightRow(7, 8)],
      hipToSourceId: new Map(), // no cross-match: the bright row is a distinct star
      famousGaiaIds: new Set(),
      famousHipIds: new Set(),
    });

    expect(stars).toHaveLength(2);
    expect(stars.map((s) => s.absMag).sort((a, b) => a - b)).toEqual([4, 8]);
    expect(drops.hipGaiaSubtracted).toBe(0);
    expect(drops.famousSubtracted).toBe(0);
  });

  it('subtracts a Hipparcos-bright row that is ALSO a famous star', () => {
    // The bright row maps to a famous Gaia id, so the outer ∖ famousStarSet must
    // remove it even though it entered via the Hipparcos side, not the Gaia side.
    const hipToSourceId = new Map<number, bigint>([[11, 5000n]]);

    const { stars, drops } = selectStars({
      gaia: [],
      hipparcosBright: [brightRow(11, 6)],
      hipToSourceId,
      famousGaiaIds: new Set([5000n]),
      famousHipIds: new Set(),
    });

    expect(stars).toHaveLength(0);
    expect(drops.famousSubtracted).toBe(1);
    expect(drops.hipGaiaSubtracted).toBe(0);
  });

  it('subtracts a bright row by direct HIP id when it has no Gaia cross-match', () => {
    // The Alpha-Cen case: the brightest famous stars have NO Gaia DR3 row, so
    // their bright Hipparcos row has no hipToSourceId entry and the Gaia-id path
    // can never catch them. The direct HIP-id subtraction is the reliable key.
    const { stars, drops } = selectStars({
      gaia: [],
      hipparcosBright: [brightRow(71681, 6), brightRow(88888, 7)],
      hipToSourceId: new Map(), // neither bright row cross-matches a Gaia id
      famousGaiaIds: new Set(),
      famousHipIds: new Set([71681]),
    });

    // HIP 71681 is a famous scene body → subtracted; the non-famous bright row
    // (HIP 88888) survives.
    expect(stars).toHaveLength(1);
    expect(stars[0]?.absMag).toBe(7);
    expect(drops.famousSubtracted).toBe(1);
    expect(drops.hipGaiaSubtracted).toBe(0);
  });

  it('leaves the caller-owned distance-drop counters at zero', () => {
    const { drops } = selectStars({
      gaia: [],
      hipparcosBright: [],
      hipToSourceId: new Map(),
      famousGaiaIds: new Set(),
      famousHipIds: new Set(),
    });

    // noBailerJones / hipNonPositivePlx belong to the parse/resolve stages; the
    // orchestrator overwrites them. selectStars never invents values for them.
    expect(drops.noBailerJones).toBe(0);
    expect(drops.hipNonPositivePlx).toBe(0);
  });
});
