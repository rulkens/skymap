import { expect, it } from 'vitest';

import { clockRate } from '../../../packages/website/src/utils/clockRate';

it('reads a film clock in the largest unit that stays at one or more, whole from ten up', () => {
  expect(clockRate(4, 5)).toBe('19 h/s');
  expect(clockRate(20 * 365.25, 5)).toBe('4 yr/s');
  expect(clockRate(27.321661, 5)).toBe('5.5 d/s');
  expect(clockRate(0.99727, 5)).toBe('4.8 h/s');
});
