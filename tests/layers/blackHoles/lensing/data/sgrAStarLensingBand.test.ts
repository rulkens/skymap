import { describe, it, expect } from 'vitest';

import { SGR_A_STAR_LENSING_BAND } from '../../../../../src/layers/blackHoles/lensing/data/sgrAStarLensingBand';
import { fadeBand } from '../../../../../src/utils/math/fadeBand';

describe('SGR_A_STAR_LENSING_BAND', () => {
  // The DIRECTION is the load-bearing fact: `fullAt < goneAt` makes this an
  // approach fade, so the lens engages as the camera closes on Sgr A*. Edges
  // swapped, it would fade OUT on approach — the opposite of the effect — and
  // still type-check. Read off the band itself, so an intentional retune of
  // where the envelope sits stays green.
  it('fades IN on approach, monotonically across the envelope', () => {
    const { fullAt, goneAt } = SGR_A_STAR_LENSING_BAND;
    expect(fullAt).toBeLessThan(goneAt);

    const midpoint = (fullAt + goneAt) / 2;
    const nearMid = (fullAt + midpoint) / 2;
    expect(fadeBand(SGR_A_STAR_LENSING_BAND, fullAt)).toBe(1);
    expect(fadeBand(SGR_A_STAR_LENSING_BAND, goneAt)).toBe(0);
    expect(fadeBand(SGR_A_STAR_LENSING_BAND, nearMid)).toBeGreaterThan(
      fadeBand(SGR_A_STAR_LENSING_BAND, midpoint),
    );
    expect(fadeBand(SGR_A_STAR_LENSING_BAND, midpoint)).toBeGreaterThan(0);
    expect(fadeBand(SGR_A_STAR_LENSING_BAND, midpoint)).toBeLessThan(1);
  });
});
