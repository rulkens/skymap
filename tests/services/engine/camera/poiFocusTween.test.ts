import { describe, it, expect } from 'vitest';
import { poiFocusDistanceMpc } from '../../../../src/services/engine/camera/poiFocusTween';

describe('poiFocusDistanceMpc', () => {
  it('frames a cluster at 8x its radius', () => {
    // Virgo: ~2 Mpc radius → 16 Mpc framing.
    expect(poiFocusDistanceMpc('cluster', 2)).toBe(16);
  });

  it('frames a supercluster at 2.5x its radius', () => {
    // Hercules SC: ~50 Mpc radius → 125 Mpc framing.
    expect(poiFocusDistanceMpc('supercluster', 50)).toBe(125);
  });

  it('frames a void at 2.5x its radius', () => {
    // Boötes Void: ~50 Mpc radius → 125 Mpc framing.
    expect(poiFocusDistanceMpc('void', 50)).toBe(125);
  });

  it('clamps tiny POIs up to the 1 Mpc minimum', () => {
    // A 0.05 Mpc cluster × 8 = 0.4 Mpc → clamp up to 1 Mpc so the
    // camera doesn't end up inside the halo.
    expect(poiFocusDistanceMpc('cluster', 0.05)).toBe(1);
  });

  it('clamps huge POIs down to the 800 Mpc maximum', () => {
    // A 500 Mpc supercluster × 2.5 = 1250 Mpc → clamp down to 800
    // Mpc so the framing stays inside the visible volume.
    expect(poiFocusDistanceMpc('supercluster', 500)).toBe(800);
  });

  it('treats non-finite radius as zero (then clamps to 1 Mpc minimum)', () => {
    // Defensive: a POI with NaN / Infinity radius should not produce a
    // NaN framing distance.  Same fallback shape as
    // focusDistanceMpc(undefined) → MIN_FOCUS_DISTANCE_MPC.
    expect(poiFocusDistanceMpc('cluster', Number.NaN)).toBe(1);
    expect(poiFocusDistanceMpc('cluster', Number.POSITIVE_INFINITY)).toBe(800);
    expect(poiFocusDistanceMpc('cluster', -1)).toBe(1);
  });
});
