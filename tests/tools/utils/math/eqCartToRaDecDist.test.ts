import { describe, it, expect } from 'vitest';
import { eqCartToRaDecDist } from '../../../../tools/utils/math/eqCartToRaDecDist';

describe('eqCartToRaDecDist', () => {
  it('on the +x axis returns RA=0, Dec=0', () => {
    const r = eqCartToRaDecDist([10, 0, 0]);
    expect(r.raHours).toBeCloseTo(0, 9);
    expect(r.decDeg).toBeCloseTo(0, 9);
    expect(r.distMpc).toBeCloseTo(10, 9);
  });

  it('on the +z axis returns Dec=+90°', () => {
    const r = eqCartToRaDecDist([0, 0, 7]);
    expect(r.decDeg).toBeCloseTo(90, 9);
    expect(r.distMpc).toBeCloseTo(7, 9);
  });

  it('on the +y axis returns RA=6h', () => {
    const r = eqCartToRaDecDist([0, 5, 0]);
    expect(r.raHours).toBeCloseTo(6, 9);
    expect(r.decDeg).toBeCloseTo(0, 9);
  });
});
