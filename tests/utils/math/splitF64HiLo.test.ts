import { describe, expect, it } from 'vitest';
import { splitF64HiLo } from '../../../src/utils/math/splitF64HiLo';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('splitF64HiLo', () => {
  it('reconstructs within 1 km at 160 AU (in Mpc)', () => {
    const au = 1.495978707e8; // km
    const values = Float64Array.from(
      [160 * au, -160 * au * 0.37, 123_456_789_012.345].map((km) => km * SCALE_UNITS.KM_TO_MPC),
    );
    const { hi, lo } = splitF64HiLo(values);
    for (let i = 0; i < values.length; i++) {
      const errKm = Math.abs(hi[i]! + lo[i]! - values[i]!) / SCALE_UNITS.KM_TO_MPC;
      expect(errKm).toBeLessThan(1);
    }
  });

  it('the camera-relative difference keeps sub-km precision where a plain f32 loses ~1000 km', () => {
    const k = SCALE_UNITS.KM_TO_MPC;
    const pos = Float64Array.of(2.4e10 * k);
    const cam = Float64Array.of((2.4e10 - 1234.5) * k);
    const p = splitF64HiLo(pos);
    const c = splitF64HiLo(cam);
    const relKm = (p.hi[0]! - c.hi[0]! + (p.lo[0]! - c.lo[0]!)) / k;
    expect(Math.abs(relKm - 1234.5)).toBeLessThan(1);
    const naiveKm = (Math.fround(pos[0]!) - Math.fround(cam[0]!)) / k;
    expect(Math.abs(naiveKm - 1234.5)).toBeGreaterThan(10);
  });
});
