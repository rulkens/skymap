/**
 * Tier selectors — unit test for the RootState-scoped tier read seam.
 *
 * `selectTier` lifts the `tier` root slice straight out of `RootState`. The test
 * builds a RootState-shaped object with both routes present and asserts the
 * selector returns the slice value verbatim. We only read `.tier`, so the
 * settings slot is stubbed and the whole literal is cast `as unknown as RootState`
 * rather than constructed through a real settings fixture.
 */

import { describe, it, expect } from 'vitest';

import { selectTier } from '../../../src/state/tier/selectors';
import { settingsRoute, tierRoute } from '../../../src/store/constants';
import type { RootState } from '../../../src/store/types';

describe('selectTier', () => {
  it('lifts state.tier', () => {
    const state = {
      [tierRoute]: 'small',
      [settingsRoute]: {},
    } as unknown as RootState;

    expect(selectTier(state)).toBe('small');
  });
});
