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
      galaxyType(Source.TwoMRS, { magU: NaN, magG: 8.5, magR: 8.0, magI: 7.4, magZ: NaN }).category,
    ).toBe('red');
  });

  // Diagnostic outcome: the dispatcher's UNKNOWN fallback uses category
  // `'green'` (intermediate), not the literal `'unknown'` that the type
  // permits.  See the docblock on `UNKNOWN` in galaxyType.ts: the
  // InfoCard prefers a neutral colour swatch over a special unknown
  // state, so 'green' is intentional.  Pin it here so a refactor that
  // "fixes" UNKNOWN to actually say `'unknown'` flips this test loudly.
  it('NaN photometry on the dispatched channels falls back to the green-valley UNKNOWN', () => {
    expect(
      galaxyType(Source.SDSS, { magU: NaN, magG: NaN, magR: NaN, magI: NaN, magZ: NaN }).category,
    ).toBe('green');
  });

  // Diagnostic outcome: Source.FamousGalaxy *does* run a classifier (u−r via
  // galaxyTypeFromColor), so all-zero photometry yields a colour rather
  // than the UNKNOWN fallback.  u−r = 0 ≤ 2.2, so the result is 'blue'.
  // The original spec assumed Famous had no classifier; reality is that
  // the dispatcher reuses the SDSS path because Famous entries borrow
  // SDSS-style optical slots (see comment in galaxyType.ts case body).
  it('Source.FamousGalaxy reuses the SDSS u−r classifier (zero photometry → blue)', () => {
    expect(
      galaxyType(Source.FamousGalaxy, { magU: 0, magG: 0, magR: 0, magI: 0, magZ: 0 }).category,
    ).toBe('blue');
  });
  it('Source.FamousGalaxy with NaN photometry falls back to UNKNOWN (green)', () => {
    expect(
      galaxyType(Source.FamousGalaxy, { magU: NaN, magG: 0, magR: NaN, magI: 0, magZ: 0 }).category,
    ).toBe('green');
  });
});
