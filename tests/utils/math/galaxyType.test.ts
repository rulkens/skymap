import { describe, it, expect } from 'vitest';
import { galaxyType } from '../../../src/utils/math/galaxyType';
import { Source } from '../../../src/data/sources';

describe('galaxyType', () => {
  it('SDSS dispatches to u−r classifier', () => {
    // u=18, g=17.5, r=17 → u−r = 1.0 → blue
    expect(
      galaxyType(Source.SDSS, { magU: 18, magG: 17.5, magR: 17, magI: 16.8, magZ: 16.6 }).category,
    ).toBe('blue');
  });
  it('GLADE dispatches to B−J classifier', () => {
    // B=14, J=11 → B−J = 3.0 → red
    expect(
      galaxyType(Source.Glade, { magU: NaN, magG: 14, magR: 11, magI: 10.5, magZ: 10 }).category,
    ).toBe('red');
  });
  it('2MRS dispatches to J−K classifier', () => {
    // J=8.5, K=7.4 → J−K = 1.1 → red
    expect(
      galaxyType(Source.TwoMRS, { magU: NaN, magG: 8.5, magR: 8.0, magI: 7.4, magZ: NaN })
        .category,
    ).toBe('red');
  });
});
