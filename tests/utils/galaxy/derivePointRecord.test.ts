import { describe, it, expect } from 'vitest';
import { derivePointRecord } from '../../../src/utils/galaxy/derivePointRecord';
import type { GalaxyPointFields } from '../../../src/@types/engine/GalaxyPointFields';
import type { GalaxyPointDerived } from '../../../src/@types/engine/GalaxyPointDerived';
import type { GalaxyPointStats } from '../../../src/@types/engine/GalaxyPointStats';

function fields(over: Partial<GalaxyPointFields> = {}): GalaxyPointFields {
  return {
    x: 100,
    y: 0,
    z: 0,
    magnitude: 18,
    axisRatio: 0.7,
    positionAngleDeg: 45,
    diameterKpc: 30,
    orientationIsFallback: false,
    diameterIsFallback: false,
    ...over,
  };
}

const NO_SHIFT: GalaxyPointStats = { magOffset: 0, medianAbsMag: -20 };

function derive(f: GalaxyPointFields, stats: GalaxyPointStats = NO_SHIFT): GalaxyPointDerived {
  const out: GalaxyPointDerived = {
    magnitude: 0,
    axisRatio: 0,
    paCos: 0,
    paSin: 0,
    radiusMpc: 0,
    absMag: 0,
    sbAmp: 0,
  };
  derivePointRecord(f, stats, out);
  return out;
}

describe('derivePointRecord', () => {
  it('keeps axisRatio positive when the orientation is measured', () => {
    expect(derive(fields()).axisRatio).toBeCloseTo(0.7, 5);
  });

  it('flips the axisRatio sign bit when the orientation is a fallback', () => {
    expect(derive(fields({ orientationIsFallback: true })).axisRatio).toBeCloseTo(-0.7, 5);
  });

  it('a NaN axis ratio stays NaN even when flagged fallback (round mask, no flag)', () => {
    expect(derive(fields({ axisRatio: NaN, orientationIsFallback: true })).axisRatio).toBeNaN();
  });

  it('flips the radiusMpc sign bit when the diameter is a fallback', () => {
    expect(derive(fields()).radiusMpc).toBeGreaterThan(0);
    expect(derive(fields({ diameterIsFallback: true })).radiusMpc).toBeLessThan(0);
  });

  it('bakes cos/sin of the negated position angle', () => {
    // PA = 45° east-of-north → cos(-45°) = +√2/2, sin(-45°) = -√2/2.
    const out = derive(fields());
    expect(out.paCos).toBeCloseTo(Math.SQRT1_2, 6);
    expect(out.paSin).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it('derives absMag from the OFFSET magnitude, not the raw one', () => {
    // Raw 16 shifted by +2 → 18; at d = 100 Mpc the distance modulus is 35, so
    // absMag = −17. The raw magnitude would give −19.
    const out = derive(fields({ magnitude: 16 }), { magOffset: 2, medianAbsMag: -20 });
    expect(out.magnitude).toBeCloseTo(18, 5);
    expect(out.absMag).toBeCloseTo(-17, 5);
  });

  it('a NaN magnitude snaps to the SDSS target mean and still derives a finite absMag offset', () => {
    const out = derive(fields({ magnitude: NaN }), { magOffset: 2, medianAbsMag: -20 });
    expect(out.magnitude).toBe(18);
    expect(out.absMag).toBeCloseTo(-17, 5);
    // sbAmp reads the raw apparent magnitude; NaN there falls back to unit amplitude.
    expect(out.sbAmp).toBe(1);
  });
});
