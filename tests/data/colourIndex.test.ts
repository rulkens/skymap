import { describe, it, expect } from 'vitest';
import { pickColourIndex, UNKNOWN_COLOUR_RAMP_POSITION } from '../../src/data/colourIndex';
import { Source } from '../../src/data/sources';

// d = 0 collapses the K-correction term to zero so the assertions can
// focus on the observed-colour normalisation. Standalone K-correction
// behaviour is exercised by the dedicated test further down.
const D_ZERO = 0;

describe('pickColourIndex', () => {
  it('SDSS uses u−g and normalises to ramp position', () => {
    // u=18.5, g=17.5 → u−g = 1.0 → normalised to (1.0-0.5)/(2.0-0.5)*2 ≈ 0.667
    const result = pickColourIndex(Source.SDSS, 18.5, 17.5, NaN, NaN, NaN, D_ZERO);
    expect(result).toBeCloseTo(0.667, 2);
  });

  it('2MRS uses J−K (slot G − slot I)', () => {
    // J=8.5, K=7.6 → J−K = 0.9 → (0.9-0.7)/(1.1-0.7)*2 = 1.0
    const result = pickColourIndex(Source.TwoMRS, NaN, 8.5, NaN, 7.6, NaN, D_ZERO);
    expect(result).toBeCloseTo(1.0, 2);
  });

  it('GLADE uses B−J (slot G − slot R)', () => {
    // B=14.0, J=12.0 → B−J = 2.0 → (2.0-0.5)/(3.5-0.5)*2 = 1.0
    const result = pickColourIndex(Source.Glade, NaN, 14.0, 12.0, NaN, NaN, D_ZERO);
    expect(result).toBeCloseTo(1.0, 2);
  });

  it('clamps out-of-range colours to [0, 2]', () => {
    // Extreme blue SDSS galaxy: u−g = 0.0 (well below natural min of 0.5)
    const result = pickColourIndex(Source.SDSS, 17.0, 17.0, NaN, NaN, NaN, D_ZERO);
    expect(result).toBe(0);
  });

  it('returns UNKNOWN_COLOUR_RAMP_POSITION when a constituent band is NaN', () => {
    // GLADE without B-band
    expect(pickColourIndex(Source.Glade, NaN, NaN, 12.0, NaN, NaN, D_ZERO)).toBe(
      UNKNOWN_COLOUR_RAMP_POSITION,
    );
  });

  it('applies K-correction at non-zero distance', () => {
    // SDSS kPerZ = 3.0.  d = 428.275 Mpc corresponds to z ≈ 0.1027 under
    // the ΛCDM inverse (slightly higher than the linear-Hubble z = 0.1
    // because ΛCDM puts the same redshift at a closer distance).  Shift
    // = 0.1027 · 3.0 ≈ 0.308 ramp-units, so 0.667 − 0.308 ≈ 0.359.
    const result = pickColourIndex(Source.SDSS, 18.5, 17.5, NaN, NaN, NaN, 428.2749);
    expect(result).toBeCloseTo(0.359, 2);
  });

  it('exports UNKNOWN_COLOUR_RAMP_POSITION as the shared fallback', () => {
    expect(UNKNOWN_COLOUR_RAMP_POSITION).toBe(1.05);
  });
});
