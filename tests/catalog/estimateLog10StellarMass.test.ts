import { describe, it, expect } from 'vitest';
import {
  estimateLog10StellarMass,
  type StellarMassEstimateInput,
} from '../../tools/catalog/estimateLog10StellarMass';
import { Source } from '../../src/data/sources';

/** Minimal StellarMassEstimateInput fixture; unused magnitude slots default to NaN. */
function input(partial: Partial<StellarMassEstimateInput>): StellarMassEstimateInput {
  return {
    source: Source.SDSS,
    magU: NaN,
    magG: NaN,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
    distMpc: 0,
    ...partial,
  };
}

describe('estimateLog10StellarMass — SDSS', () => {
  it('uses the Bell g-r relation on the r-band luminosity', () => {
    // M_r = 16.8 - 5*log10(100) - 25 = -18.2
    // log10(M/L_r) = -0.306 + 1.097*(17.5-16.8) - 0.15 = 0.3119
    // log10 M = 0.3119 + 0.4*(4.65 - (-18.2)) = 9.452
    const out = estimateLog10StellarMass(
      input({ source: Source.SDSS, magG: 17.5, magR: 16.8, distMpc: 100 }),
    );
    expect(out).toBeCloseTo(9.452, 2);
  });

  it('propagates NaN when a required magnitude is missing', () => {
    const out = estimateLog10StellarMass(
      input({ source: Source.SDSS, magG: 17.5, magR: NaN, distMpc: 100 }),
    );
    expect(out).toBeNaN();
  });

  it('propagates NaN when distMpc is non-positive', () => {
    const out = estimateLog10StellarMass(
      input({ source: Source.SDSS, magG: 17.5, magR: 16.8, distMpc: 0 }),
    );
    expect(out).toBeNaN();
  });
});

describe('estimateLog10StellarMass — 2MRS', () => {
  it('uses the flat K-band M/L on the magI slot', () => {
    // M_K = 10.0 - 5*log10(50) - 25 = -23.4949
    // log10 M = log10(0.6) + 0.4*(3.27 - (-23.4949)) = 10.484
    const out = estimateLog10StellarMass(input({ source: Source.TwoMRS, magI: 10.0, distMpc: 50 }));
    expect(out).toBeCloseTo(10.484, 2);
  });
});

describe('estimateLog10StellarMass — GLADE', () => {
  it('uses the Bell B-V relation when both bands are real', () => {
    // M_B = 13.0 - 5*log10(20) - 25 = -18.5051
    // log10(M/L_B) = -0.942 + 1.737*(13.0-12.3) - 0.15 = 0.1239
    // log10 M = 0.1239 + 0.4*(5.44 - (-18.5051)) = 9.702
    const out = estimateLog10StellarMass(
      input({ source: Source.Glade, magG: 13.0, magR: 12.3, distMpc: 20 }),
    );
    expect(out).toBeCloseTo(9.702, 2);
  });

  it('falls back to an assumed colour when only B is real', () => {
    const out = estimateLog10StellarMass(
      input({ source: Source.Glade, magG: 13.0, magR: NaN, distMpc: 20 }),
    );
    expect(Number.isFinite(out)).toBe(true);
    expect(out).not.toBeCloseTo(9.702, 2);
  });

  it('famous galaxies use the GLADE B/V branch', () => {
    const out = estimateLog10StellarMass(
      input({ source: Source.FamousGalaxy, magG: 13.0, magR: 12.3, distMpc: 20 }),
    );
    expect(out).toBeCloseTo(9.702, 2);
  });
});

describe('estimateLog10StellarMass — sources with no stellar-mass relation', () => {
  it('quasar sources yield no stellar mass', () => {
    const milliquas = estimateLog10StellarMass(
      input({
        source: Source.Milliquas,
        magU: 18,
        magG: 17.5,
        magR: 16.8,
        magI: 16.3,
        magZ: 16.0,
        distMpc: 100,
      }),
    );
    const desiDeep = estimateLog10StellarMass(
      input({
        source: Source.DesiDeep,
        magU: 18,
        magG: 17.5,
        magR: 16.8,
        magI: 16.3,
        magZ: 16.0,
        distMpc: 100,
      }),
    );
    expect(milliquas).toBeNaN();
    expect(desiDeep).toBeNaN();
  });
});
