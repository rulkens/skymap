import { describe, it, expect } from 'vitest';
import { S_STAR_SEEDS } from '../../../src/data/bodies/sStarElements';

/**
 * Three structural invariants of a 40-row hand transcription. The element VALUES
 * are verified against VizieR once, by the diff recorded with the commit, not
 * re-asserted here — restating them would only mirror the table. A row count is
 * likewise excluded: it restates an authored literal and catches nothing the
 * transcription diff does not.
 */
describe('S_STAR_SEEDS', () => {
  it('gives every seed a unique id', () => {
    // The copy-paste slip a long transcription actually produces, and one that
    // fails silently: every downstream lookup is id-keyed, so a collision
    // shadows a star rather than raising.
    const ids = S_STAR_SEEDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('excludes the unbound star S111', () => {
    // Gillessen's 40th row is a = −12.3″, e = 1.092, no period. It is a real
    // hyperbolic orbit, and `propagateElements` is elliptical-only, so seeding
    // it would put a star at a NaN position with no error.
    expect(S_STAR_SEEDS.map((s) => s.id)).not.toContain('s111');
  });

  it('gives every seed a positive semi-major axis and eccentricity below 1', () => {
    // The property that makes `propagateElements` (elliptical-only) applicable
    // to every row — the machine-checkable generalisation of the S111 exclusion
    // above, rather than a second test pinned to that one id.
    for (const seed of S_STAR_SEEDS) {
      expect(seed.semiMajorArcsec).toBeGreaterThan(0);
      expect(seed.eccentricity).toBeLessThan(1);
    }
  });
});
