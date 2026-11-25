import { describe, expect, it } from 'vitest';
import { parseTypedNumber } from '../../../src/utils/input/parseTypedNumber';

describe('parseTypedNumber', () => {
  it('reads plain, negative, signed and exponent numbers inside the range', () => {
    expect(parseTypedNumber('2.5', 0, 10)).toBe(2.5);
    expect(parseTypedNumber('-17.25', -24, -15)).toBe(-17.25);
    expect(parseTypedNumber('+3', 0, 10)).toBe(3);
    expect(parseTypedNumber('.5', 0, 1)).toBe(0.5);
    expect(parseTypedNumber('1.5e-3', 0, 1)).toBe(0.0015);
    expect(parseTypedNumber('2E2', 0, 1000)).toBe(200);
  });

  it('accepts a trailing dot and surrounding whitespace', () => {
    expect(parseTypedNumber('4.', 0, 10)).toBe(4);
    expect(parseTypedNumber('  7 ', 0, 10)).toBe(7);
  });

  it('treats a half-typed number as incomplete, not invalid', () => {
    for (const text of ['', '   ', '-', '+', '.', '-.', '1e', '2.5e-']) {
      expect(parseTypedNumber(text, 0, 10), JSON.stringify(text)).toBe('incomplete');
    }
  });

  it('rejects a comma, words, hex and infinities', () => {
    for (const text of ['1,5', 'abc', '1.2.3', '0x10', 'Infinity', '1 2', 'e5']) {
      expect(parseTypedNumber(text, -100, 100), JSON.stringify(text)).toBe('invalid');
    }
  });

  it('rejects numbers outside [min, max] and keeps both ends', () => {
    expect(parseTypedNumber('10.01', 0, 10)).toBe('invalid');
    expect(parseTypedNumber('-0.01', 0, 10)).toBe('invalid');
    expect(parseTypedNumber('10', 0, 10)).toBe(10);
    expect(parseTypedNumber('0', 0, 10)).toBe(0);
  });
});
