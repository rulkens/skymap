import { describe, expect, it } from 'vitest';

import { decodePackedNumber } from '../../../tools/asteroids/decodePackedNumber';

// Values from MPC's PackedDes.html examples (data/raw/mpcorb/README.md).
describe('decodePackedNumber', () => {
  it('reads plain, letter and tilde forms', () => {
    expect(decodePackedNumber('00001')).toBe(1);
    expect(decodePackedNumber('03202')).toBe(3202);
    expect(decodePackedNumber('A0000')).toBe(100000);
    expect(decodePackedNumber('A0345')).toBe(100345);
    expect(decodePackedNumber('K3289')).toBe(203289);
    expect(decodePackedNumber('a0017')).toBe(360017);
    expect(decodePackedNumber('~0000')).toBe(620000);
    expect(decodePackedNumber('~000z')).toBe(620061);
    expect(decodePackedNumber('~AZaz')).toBe(3140113);
  });

  it('refuses a provisional designation or a stray character', () => {
    expect(() => decodePackedNumber('K26D1')).toThrow();
    expect(() => decodePackedNumber('~00-0')).toThrow();
  });
});
