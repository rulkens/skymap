import { describe, it, expect } from 'vitest';
import { envBrdfLut } from '../../../tools/lut/envBrdfLut';

// Coarser than the baked 128² / 1024 asset: the integrand is the same, and
// both anchors are about the physics rather than the sampling budget.
const SIZE = 32;
const LUT = envBrdfLut(SIZE, 256);

describe('envBrdfLut', () => {
  it('a mirror at normal incidence reflects everything: (NoV=1, roughness≈0) → scale≈1, bias≈0', () => {
    // Row 0, last column. F = F0 at VoH = 1, and D·G / (4 NoV NoL)
    // integrates to 1 over the Dirac lobe a near-zero roughness leaves, so
    // all the energy lands in the F0-scaled term.
    const scale = LUT[(SIZE - 1) * 2]!;
    const bias = LUT[(SIZE - 1) * 2 + 1]!;
    expect(Math.abs(scale - 1)).toBeLessThan(0.02);
    expect(Math.abs(bias)).toBeLessThan(0.02);
  });

  it('never returns more energy than it receives: 0 ≤ scale + bias ≤ 1 at every texel', () => {
    for (let i = 0; i < LUT.length; i += 2) {
      const reflected = LUT[i]! + LUT[i + 1]!;
      expect(reflected).toBeGreaterThanOrEqual(0);
      expect(reflected).toBeLessThanOrEqual(1);
    }
  });
});
