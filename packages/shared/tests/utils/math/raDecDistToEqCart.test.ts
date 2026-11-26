import { describe, it, expect } from 'vitest';
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import type { SkyCoord } from '../../../src/@types/data/SkyCoord';

describe('raDecDistToEqCart', () => {
  it('raDecDistToEqCart places RA 6h Dec 0 on +Y', () => {
    // 6 hours × 15 deg/hour = 90° — points directly along +Y.
    const c: SkyCoord = { raHours: 6, decDeg: 0, distMpc: 10 };
    const [x, y, z] = raDecDistToEqCart(c);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(10, 9);
    expect(z).toBeCloseTo(0, 9);
  });
});
