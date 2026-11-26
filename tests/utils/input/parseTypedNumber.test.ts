import { describe, expect, it } from 'vitest';
import { parseTypedNumber } from '../../../src/utils/input/parseTypedNumber';

describe('parseTypedNumber', () => {
  it('reads plain, negative, signed and exponent numbers', () => {
    expect(parseTypedNumber('2.5')).toBe(2.5);
    expect(parseTypedNumber('-17.25')).toBe(-17.25);
    expect(parseTypedNumber('+3')).toBe(3);
    expect(parseTypedNumber('.5')).toBe(0.5);
    expect(parseTypedNumber('1.5e-3')).toBe(0.0015);
    expect(parseTypedNumber('2E2')).toBe(200);
  });

  it('accepts a trailing dot and surrounding whitespace', () => {
    expect(parseTypedNumber('4.')).toBe(4);
    expect(parseTypedNumber('  7 ')).toBe(7);
  });

  it('treats a half-typed number as incomplete, not invalid', () => {
    for (const text of ['', '   ', '-', '+', '.', '-.', '1e', '2.5e-']) {
      expect(parseTypedNumber(text), JSON.stringify(text)).toBe('incomplete');
    }
  });

  it('rejects a comma, words, hex and infinities', () => {
    for (const text of ['1,5', 'abc', '1.2.3', '0x10', 'Infinity', '1 2', 'e5']) {
      expect(parseTypedNumber(text), JSON.stringify(text)).toBe('invalid');
    }
  });
});
