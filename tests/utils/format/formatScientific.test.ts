import { expect, it } from 'vitest';

import { formatScientific } from '../../../src/utils/format/formatScientific';

it('prints one mantissa decimal, drops ".0", and carries a rounded-up mantissa into the power', () => {
  expect(formatScientific(5.6e5)).toBe('5.6 × 10⁵');
  expect(formatScientific(10.4e3)).toBe('1 × 10⁴');
  expect(formatScientific(9.96e3)).toBe('1 × 10⁴');
  expect(formatScientific(1.4e12)).toBe('1.4 × 10¹²');
  expect(formatScientific(2.5e-3)).toBe('2.5 × 10⁻³');
});
