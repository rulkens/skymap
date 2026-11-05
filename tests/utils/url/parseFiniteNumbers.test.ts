import { describe, it, expect } from 'vitest';

import { parseFiniteNumbers } from '../../../src/utils/url/parseFiniteNumbers';

describe('parseFiniteNumbers', () => {
  it('parses every field to a number', () => {
    expect(parseFiniteNumbers(['1', '-2.5', '0'])).toEqual([1, -2.5, 0]);
  });

  it('fails the whole batch on an empty field', () => {
    // Number('') is 0, not NaN — the case this function exists to close.
    expect(parseFiniteNumbers(['1', '', '3'])).toBeNull();
  });

  it('fails the whole batch on a non-numeric field', () => {
    expect(parseFiniteNumbers(['1', 'NaN', '3'])).toBeNull();
  });
});
