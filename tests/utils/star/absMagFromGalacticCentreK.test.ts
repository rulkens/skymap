import { describe, expect, it } from 'vitest';

import { absMagFromGalacticCentreK } from '../../../src/utils/star/absMagFromGalacticCentreK';

describe('absMagFromGalacticCentreK', () => {
  it("S2's dereddened M_K matches its published B0-2V classification", () => {
    // Hand-computed: 13.95 − 14.56 − 2.5 ≈ −3.11. This is the end-to-end
    // sanity check on the whole distance-modulus + extinction chain — S2's
    // published spectral type (B0-2V) is only consistent with an M_K this
    // negative, so a wrong sign or a dropped term would land far outside it.
    expect(absMagFromGalacticCentreK(13.95)).toBeCloseTo(-3.11, 2);
  });

  it('a one-magnitude difference in apparent K survives as one magnitude absolute', () => {
    // The map is a fixed offset (distance modulus + extinction, both
    // constant across stars), so it must be affine: a bug that clamps,
    // saturates, or rescales the range would fail this while still passing
    // the single-point S2 check above.
    const delta = absMagFromGalacticCentreK(11.0) - absMagFromGalacticCentreK(10.0);
    expect(delta).toBeCloseTo(1, 9);
  });
});
