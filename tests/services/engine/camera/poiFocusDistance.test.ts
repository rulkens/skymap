import { describe, it, expect } from 'vitest';
import { poiFocusDistance } from '../../../../src/services/engine/camera/poiFocusDistance';

describe('poiFocusDistance', () => {
  it('frames a cluster at 8x its radius', () => {
    // Virgo: ~2 Mpc radius → 16 Mpc framing.
    expect(poiFocusDistance('cluster', 2)).toBe(16);
  });

  it('frames a supercluster at 2.5x its radius', () => {
    // Hercules SC: ~50 Mpc radius → 125 Mpc framing.
    expect(poiFocusDistance('supercluster', 50)).toBe(125);
  });

  it('frames a void at 2.5x its radius', () => {
    // Boötes Void: ~50 Mpc radius → 125 Mpc framing.
    expect(poiFocusDistance('void', 50)).toBe(125);
  });

  it('clamps tiny POIs up to the 1 Mpc minimum', () => {
    // A 0.05 Mpc cluster × 8 = 0.4 Mpc → clamp up to 1 Mpc so the
    // camera doesn't end up inside the halo.
    expect(poiFocusDistance('cluster', 0.05)).toBe(1);
  });

  it('clamps huge POIs down to the 800 Mpc maximum', () => {
    // A 500 Mpc supercluster × 2.5 = 1250 Mpc → clamp down to 800
    // Mpc so the framing stays inside the visible volume.
    expect(poiFocusDistance('supercluster', 500)).toBe(800);
  });

  it('treats non-finite radius as zero (then clamps to 1 Mpc minimum)', () => {
    // Defensive: a POI with NaN / Infinity radius should not produce a
    // NaN framing distance.  Same fallback shape as
    // galaxyFocusDistance(undefined) → MIN_FOCUS_DISTANCE_MPC.
    expect(poiFocusDistance('cluster', Number.NaN)).toBe(1);
    expect(poiFocusDistance('cluster', Number.POSITIVE_INFINITY)).toBe(800);
    expect(poiFocusDistance('cluster', -1)).toBe(1);
  });
});
