import { describe, expect, it } from 'vitest';
import { writeHiLoVertex } from '../../../src/utils/math/writeHiLoVertex';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('writeHiLoVertex', () => {
  it('reconstructs within 1 km at 160 AU (in Mpc)', () => {
    const au = 1.495978707e8; // km
    const values = [160 * au, -160 * au * 0.37, 123_456_789_012.345].map(
      (km) => km * SCALE_UNITS.KM_TO_MPC,
    );
    const out = new Float32Array(6);
    writeHiLoVertex(values, 0, out, 0);
    for (let i = 0; i < 3; i++) {
      const errKm = Math.abs(out[i]! + out[3 + i]! - values[i]!) / SCALE_UNITS.KM_TO_MPC;
      expect(errKm).toBeLessThan(1);
    }
  });

  it('the camera-relative difference keeps sub-km precision where a plain f32 loses ~1000 km', () => {
    const k = SCALE_UNITS.KM_TO_MPC;
    const pos = [2.4e10 * k, 0, 0];
    const cam = [(2.4e10 - 1234.5) * k, 0, 0];
    const p = new Float32Array(6);
    const c = new Float32Array(6);
    writeHiLoVertex(pos, 0, p, 0);
    writeHiLoVertex(cam, 0, c, 0);
    const relKm = (p[0]! - c[0]! + (p[3]! - c[3]!)) / k;
    expect(Math.abs(relKm - 1234.5)).toBeLessThan(1);
    const naiveKm = (Math.fround(pos[0]!) - Math.fround(cam[0]!)) / k;
    expect(Math.abs(naiveKm - 1234.5)).toBeGreaterThan(10);
  });
});
