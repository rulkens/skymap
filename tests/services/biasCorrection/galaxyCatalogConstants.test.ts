/**
 * Galaxy catalog constants table — eager-build identity stability.
 *
 * The table caches three pure-functions-of-Source values (Schechter
 * triple, flux limit, central-density normaliser) so the bias-correction
 * subsystem can look them up without re-running `expectedNumberDensity`
 * per call.  This test asserts the eager-built table returns a stable
 * object identity across calls, so consumers can use it as a cheap cache
 * key without copying.
 */

import { describe, it, expect } from 'vitest';
import { galaxyCatalogConstants } from '../../../src/services/biasCorrection/galaxyCatalogConstants';
import { Source } from '../../../src/data/sources';

describe('galaxyCatalogConstants table', () => {
  it('returns the same object across calls (eager-build identity is stable)', () => {
    // Eager-built table: identity should be stable across calls so
    // consumers can use it as a cheap cache key without copying.
    const a = galaxyCatalogConstants(Source.SDSS);
    const b = galaxyCatalogConstants(Source.SDSS);
    expect(a).toBe(b);
  });
});
