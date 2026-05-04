/**
 * Unit tests for `galaxyTypeFromColor` — Strateva 2001 u−r threshold classifier.
 *
 * Pins the canonical 2.2 boundary (red sequence vs blue cloud) and the NaN
 * guard for missing photometry.
 */

import { describe, it, expect } from 'vitest';
import { galaxyTypeFromColor } from '../../../src/utils/math/galaxyTypeFromColor';

describe('galaxyTypeFromColor', () => {
  it('classifies u−r > 2.2 as a red, quiescent galaxy', () => {
    // Strateva et al. 2001: galaxies redder than u−r = 2.2 dominate the red
    // sequence — old stellar populations, low star-formation rate.
    const result = galaxyTypeFromColor(2.5);
    expect(result.category).toBe('red');
    expect(result.description).toMatch(/quiescent/);
  });

  it('classifies u−r ≤ 2.2 as a blue, star-forming galaxy', () => {
    // Below the threshold sits the blue cloud — young O/B stars dominate
    // the integrated colour.
    const result = galaxyTypeFromColor(1.0);
    expect(result.category).toBe('blue');
    expect(result.description).toMatch(/star-forming/);
  });

  it('classifies the threshold value (u−r = 2.2) as blue (≤ branch)', () => {
    // The source uses `> 2.2` for red, so the boundary value itself falls into
    // the else branch (blue).  Pin this to catch any future refactor that
    // accidentally flips the comparison to `>=`.
    expect(galaxyTypeFromColor(2.2).category).toBe('blue');
  });

  it('returns "unknown" when the colour value is NaN', () => {
    // Missing or flagged photometry produces NaN at the call site; we want
    // the InfoCard to render "Unknown type" rather than mis-classifying as blue.
    const result = galaxyTypeFromColor(NaN);
    expect(result.category).toBe('unknown');
    expect(result.description).toMatch(/missing photometry/i);
  });
});
