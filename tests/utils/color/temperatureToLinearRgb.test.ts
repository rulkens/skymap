import { describe, expect, it } from 'vitest';
import { temperatureToLinearRgb } from '../../../src/utils/color/temperatureToLinearRgb';

// Effective temperatures used as fixtures — real stellar values so the
// assertions read as physics, not magic numbers:
//   Rigel  ~30000 K (hot blue supergiant)
//   Sun     ~5772 K (IAU nominal effective temperature)
const RIGEL_K = 30000;
const SUN_K = 5772;

describe('temperatureToLinearRgb', () => {
  it('hotter stars are bluer than the Sun', () => {
    const [rSun, , bSun] = temperatureToLinearRgb(SUN_K);
    const [rHot, , bHot] = temperatureToLinearRgb(RIGEL_K);
    // Blue:red ratio grows with temperature along the Planckian locus.
    expect(bHot / rHot).toBeGreaterThan(bSun / rSun);
  });

  it('the Sun is near-neutral — no single channel dominates', () => {
    const [r, g, b] = temperatureToLinearRgb(SUN_K);
    // All three channels sit within a modest band of each other; the
    // dimmest is at least half the brightest (no channel washes out).
    const lo = Math.min(r, g, b);
    const hi = Math.max(r, g, b);
    expect(lo / hi).toBeGreaterThan(0.5);
  });
});
