import { describe, expect, it } from 'vitest';
import { temperatureToLinearRgb } from '../../../src/utils/color/temperatureToLinearRgb';

// Effective temperatures used as fixtures — real stellar values so the
// assertions read as physics, not magic numbers:
//   Rigel  ~30000 K (hot blue supergiant)
//   Sun     ~5772 K (IAU nominal effective temperature)
//   M dwarf ~3000 K (cool red)
const RIGEL_K = 30000;
const SUN_K = 5772;
const M_DWARF_K = 3000;

describe('temperatureToLinearRgb', () => {
  it('outputs linear RGB normalised into [0, 1] per channel', () => {
    for (const kelvin of [RIGEL_K, SUN_K, M_DWARF_K]) {
      const [r, g, b] = temperatureToLinearRgb(kelvin);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      // Max-channel normalisation: the brightest channel pins to 1.
      expect(Math.max(r, g, b)).toBeCloseTo(1);
    }
  });

  it('hotter stars are bluer than the Sun', () => {
    const [rSun, , bSun] = temperatureToLinearRgb(SUN_K);
    const [rHot, , bHot] = temperatureToLinearRgb(RIGEL_K);
    // Blue:red ratio grows with temperature along the Planckian locus.
    expect(bHot / rHot).toBeGreaterThan(bSun / rSun);
  });

  it('cooler stars are redder than the Sun', () => {
    const [rSun, , bSun] = temperatureToLinearRgb(SUN_K);
    const [rCool, , bCool] = temperatureToLinearRgb(M_DWARF_K);
    // Red:blue ratio grows as temperature drops.
    expect(rCool / bCool).toBeGreaterThan(rSun / bSun);
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
