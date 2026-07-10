/**
 * tierSlice — unit tests for the primitive-state RTK tier slice.
 *
 * The slice state IS the `Tier` primitive, so the tests call the reducer
 * directly and assert the returned tier value (not a sub-field). They pin that
 * `setTier` returns the payload as the next state — the returning-reducer
 * contract a primitive draft forces.
 */

import { describe, it, expect } from 'vitest';

import reducer, { setTier } from '../../../src/state/tier/tierSlice';

describe('tierSlice', () => {
  it('setTier sets state to the payload', () => {
    expect(reducer('medium', setTier('large'))).toBe('large');
  });
});
