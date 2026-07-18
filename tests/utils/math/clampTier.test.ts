/**
 * clampTier — caps a requested tier at a per-body ceiling under the
 * `small < medium < large` order, and never upscales past the request. The two
 * pins exercise observationally distinct outcomes on either side of the cap
 * (not clamp-boundary edges): a `large` request under a `small` ceiling (the
 * Uranus/Neptune low-detail bodies) yields `small`, and a `small` request under
 * a `large` ceiling stays `small` — the ceiling is a maximum, not a target.
 */

import { describe, it, expect } from 'vitest';

import { clampTier } from '../../../src/utils/math/clampTier';

describe('clampTier', () => {
  it('caps to the ceiling', () => {
    expect(clampTier('large', 'small')).toBe('small'); // Uranus ceiling
    expect(clampTier('small', 'large')).toBe('small'); // never upscales
  });
});
