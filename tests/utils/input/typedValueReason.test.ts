import { describe, expect, it } from 'vitest';
import { typedValueReason } from '../../../src/utils/input/typedValueReason';

const log10 = { fromValue: (v: number) => 10 ** v, toValue: (shown: number) => Math.log10(shown) };

describe('typedValueReason', () => {
  it('says nothing for a valid value', () => {
    expect(typedValueReason({ kind: 'valid', value: 1 }, 0, 4)).toBeUndefined();
  });

  it('calls a non-number and a half-typed one not a number', () => {
    expect(typedValueReason({ kind: 'notNumber' }, 0, 4)).toBe('Not a number');
    expect(typedValueReason({ kind: 'incomplete' }, 0, 4)).toBe('Not a number');
  });

  it('gives the range, as plain numbers, for a value below min or above max', () => {
    expect(typedValueReason({ kind: 'outOfRange' }, 0.01, 4)).toBe('Between 0.01 and 4');
    expect(typedValueReason({ kind: 'outOfRange' }, -24, -15)).toBe('Between -24 and -15');
  });

  it('gives the range in shown units, low end first', () => {
    expect(typedValueReason({ kind: 'outOfRange' }, -3, 3, log10)).toBe('Between 0.001 and 1000');
    const negated = { fromValue: (v: number) => -v, toValue: (shown: number) => -shown };
    expect(typedValueReason({ kind: 'outOfRange' }, 1, 2, negated)).toBe('Between -2 and -1');
  });

  it('shortens a computed bound to six significant digits', () => {
    expect(typedValueReason({ kind: 'outOfRange' }, 1 / 60, 120.00000000000001)).toBe(
      'Between 0.0166667 and 120',
    );
  });
});
