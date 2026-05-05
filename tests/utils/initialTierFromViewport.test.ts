/**
 * Tests for initialTierFromViewport — pure function chosen by App.tsx at
 * mount time to seed the tier state.
 *
 * Rule: width < 768px → 'small' (mobile); ≥ 768px → 'medium'.  'large' is
 * never auto-selected — too many points for an unaware user, opt-in only via
 * the panel.
 */

import { describe, expect, it } from 'vitest';
import { initialTierFromViewport } from '../../src/utils/initialTierFromViewport';

describe('initialTierFromViewport', () => {
  it('returns small below the 768px breakpoint', () => {
    expect(initialTierFromViewport(320)).toBe('small');
    expect(initialTierFromViewport(767)).toBe('small');
  });

  it('returns medium at and above 768px', () => {
    expect(initialTierFromViewport(768)).toBe('medium');
    expect(initialTierFromViewport(1920)).toBe('medium');
    expect(initialTierFromViewport(4096)).toBe('medium');
  });

  it('treats non-finite width as medium (defensive default)', () => {
    expect(initialTierFromViewport(Number.NaN)).toBe('medium');
    expect(initialTierFromViewport(Number.POSITIVE_INFINITY)).toBe('medium');
  });

  it('treats zero or negative width as small (mobile-side bias)', () => {
    expect(initialTierFromViewport(0)).toBe('small');
    expect(initialTierFromViewport(-100)).toBe('small');
  });
});
