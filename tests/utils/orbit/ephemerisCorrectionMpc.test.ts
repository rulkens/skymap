import { describe, it, expect } from 'vitest';
import { ephemerisCorrectionMpc } from '../../../src/utils/orbit/ephemerisCorrectionMpc';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { EphemerisCorrection } from '../../../src/@types/scene/EphemerisCorrection';

// A 400-day span, so dt = 100 sits at τ = −0.5 with round phases.
const CORRECTION: EphemerisCorrection = {
  startJd: 2_400_000,
  endJd: 2_400_400,
  polyKm: [
    [100, -50, 7],
    [10, 0, 0],
    [0, 4, 0],
    [0, 0, 2],
  ],
  // prettier-ignore
  terms: [
    Math.PI / 100, 1000, 0, 0, 0, 500, 0, // phase π at dt = 100
    Math.PI / 400, 0, 0, 30, 0, 0, -20, // phase π/4 at dt = 100
  ],
};

function km(simDays: number): number[] {
  return ephemerisCorrectionMpc(CORRECTION, simDays).map((v) => v / SCALE_UNITS.KM_TO_MPC);
}

describe('ephemerisCorrectionMpc', () => {
  it('evaluates polynomial and terms at a known instant', () => {
    // poly at τ = −0.5: x = 100 − 5, y = −50 + 1, z = 7 − 0.25.
    // term 1 (π): x −= 1000; term 2 (π/4): z += (30 − 20)/√2.
    const [x, y, z] = km(2_400_100);
    expect(x).toBeCloseTo(95 - 1000, 6);
    expect(y).toBeCloseTo(-49, 6);
    expect(z).toBeCloseTo(6.75 + 10 / Math.SQRT2, 6);
  });

  it('holds the edge value outside the span', () => {
    const century = 36_525;
    expect(ephemerisCorrectionMpc(CORRECTION, CORRECTION.startJd - century)).toEqual(
      ephemerisCorrectionMpc(CORRECTION, CORRECTION.startJd),
    );
    expect(ephemerisCorrectionMpc(CORRECTION, CORRECTION.endJd + century)).toEqual(
      ephemerisCorrectionMpc(CORRECTION, CORRECTION.endJd),
    );
  });

  it('is continuous across both span edges', () => {
    for (const edge of [CORRECTION.startJd, CORRECTION.endJd]) {
      const a = km(edge - 1e-6);
      const b = km(edge + 1e-6);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-3);
    }
  });
});
