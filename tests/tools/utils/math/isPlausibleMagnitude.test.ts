/**
 * isPlausibleMagnitude — the shared sentinel gate every catalog parser
 * runs its magnitude columns through.
 *
 * The one thing worth pinning is the behaviour the predicate exists for:
 * a finite in-band sentinel is rejected while real photometry — from the
 * faint survey end to the brightest object anyone measures — is kept. A
 * regression here is silent everywhere else: `-9999` is finite, so no
 * downstream guard catches it.
 */

import { describe, it, expect } from 'vitest';
import { isPlausibleMagnitude } from '../../../../tools/utils/math/isPlausibleMagnitude';

describe('isPlausibleMagnitude', () => {
  it('rejects the -9999 sentinel while keeping real photometry', () => {
    expect(isPlausibleMagnitude(-9999)).toBe(false);
    // A typical SDSS main-sample galaxy.
    expect(isPlausibleMagnitude(17.9)).toBe(true);
    // The Sun — brighter than anything in any catalog here, and still in.
    expect(isPlausibleMagnitude(-26.7)).toBe(true);
  });
});
