import { describe, it, expect } from 'vitest';
import { pickColourIndex } from '../../src/data/colourIndex';
import { Source } from '../../src/data/sources';

describe('pickColourIndex', () => {
  it('SDSS uses u−g and SDSS K coefficient', () => {
    // u=18.5, g=17.5 → u−g = 1.0 → normalised to (1.0-0.5)/(2.0-0.5)*2 ≈ 0.667
    const result = pickColourIndex(Source.SDSS, 18.5, 17.5, NaN, NaN, NaN);
    expect(result).not.toBeNull();
    expect(result!.colourIndex).toBeCloseTo(0.667, 2);
    expect(result!.kPerZ).toBe(3.0);
  });

  it('2MRS uses J−K (slot G − slot I) with zero K coefficient', () => {
    // J=8.5, K=7.6 → J−K = 0.9 → (0.9-0.7)/(1.1-0.7)*2 = 1.0
    const result = pickColourIndex(Source.TwoMRS, NaN, 8.5, NaN, 7.6, NaN);
    expect(result).not.toBeNull();
    expect(result!.colourIndex).toBeCloseTo(1.0, 2);
    expect(result!.kPerZ).toBe(0.0);
  });

  it('GLADE uses B−J (slot G − slot R) with modest K coefficient', () => {
    // B=14.0, J=12.0 → B−J = 2.0 → (2.0-0.5)/(3.5-0.5)*2 = 1.0
    const result = pickColourIndex(Source.Glade, NaN, 14.0, 12.0, NaN, NaN);
    expect(result).not.toBeNull();
    expect(result!.colourIndex).toBeCloseTo(1.0, 2);
    expect(result!.kPerZ).toBe(1.0);
  });

  it('clamps out-of-range colours to [0, 2]', () => {
    // Extreme blue SDSS galaxy: u−g = 0.0 (well below natural min of 0.5)
    const result = pickColourIndex(Source.SDSS, 17.0, 17.0, NaN, NaN, NaN);
    expect(result!.colourIndex).toBe(0);
  });

  it('returns null when a constituent band is NaN', () => {
    // GLADE without B-band
    expect(pickColourIndex(Source.Glade, NaN, NaN, 12.0, NaN, NaN)).toBeNull();
  });
});
