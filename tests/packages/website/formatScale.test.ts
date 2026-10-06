import { describe, expect, it } from 'vitest';

import { formatScale } from '../../../packages/website/src/utils/formatScale';

const LS = 299_792.458;
const LY = LS * 365.25 * 86_400;

describe('formatScale', () => {
  it.each([
    [12_769, '13,000 km'],
    [250_000, '250,000 km'],
    [384_400, '1.3 light-seconds'],
    [LS * 59.9, '1 light-minutes'],
    [149_597_870.7, '8.3 light-minutes'],
    [LS * 3600 * 20, '20 light-hours'],
    [LS * 86_400 * 30, '30 light-days'],
    [LY * 4.25, '4.3 light-years'],
    [LY * 26_700, '27 thousand light-years'],
    [LY * 2.5e6, '2.5 million light-years'],
    [LY * 4.6e10, '46 billion light-years'],
  ])('%d km reads as %s', (km, text) => {
    expect(formatScale(km)).toBe(text);
  });

  it('steps to the next unit before a number outgrows its own', () => {
    for (let exp = 4; exp < 24; exp += 0.01) {
      const [value, unit] = formatScale(10 ** exp).split(' ');
      const n = Number(value!.replaceAll(',', ''));
      if (unit === 'light-seconds' || unit === 'light-minutes') expect(n).toBeLessThan(60);
      if (unit === 'light-hours') expect(n).toBeLessThan(24);
      if (unit === 'thousand' || unit === 'million') expect(n).toBeLessThan(1000);
    }
  });
});
