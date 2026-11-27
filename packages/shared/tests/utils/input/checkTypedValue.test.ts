import { describe, expect, it } from 'vitest';
import { checkTypedValue } from '../../../src/utils/input/checkTypedValue';

const log10 = { fromValue: (v: number) => 10 ** v, toValue: (shown: number) => Math.log10(shown) };

describe('checkTypedValue', () => {
  it('passes an in-range number through as the stored value', () => {
    expect(checkTypedValue(' 2.5 ', 0, 4)).toEqual({ kind: 'valid', value: 2.5 });
  });

  it('names a half-typed number, a non-number and an out-of-range number apart', () => {
    expect(checkTypedValue('1e', 0, 4).kind).toBe('incomplete');
    expect(checkTypedValue('1,5', 0, 4).kind).toBe('notNumber');
    expect(checkTypedValue('-0.5', 0, 4).kind).toBe('outOfRange');
    expect(checkTypedValue('4.5', 0, 4).kind).toBe('outOfRange');
  });

  it('converts shown units to stored ones before the range check', () => {
    expect(checkTypedValue('100', -3, 3, log10)).toEqual({ kind: 'valid', value: 2 });
    expect(checkTypedValue('1e4', -3, 3, log10).kind).toBe('outOfRange');
    // log10 of 0 and of a negative number is not finite: outside every range, not "not a number".
    expect(checkTypedValue('0', -3, 3, log10).kind).toBe('outOfRange');
    expect(checkTypedValue('-5', -3, 3, log10).kind).toBe('outOfRange');
  });
});
