import { describe, it, expect } from 'vitest';
import { wrapIndex } from '../../../../src/components/CommandPalette/utils/wrapIndex';

describe('wrapIndex', () => {
  it('wraps past the top to the last index', () => {
    expect(wrapIndex(0, -1, 5)).toBe(4);
  });

  it('wraps past the bottom to the first index', () => {
    expect(wrapIndex(4, 1, 5)).toBe(0);
  });

  it('moves within bounds without wrapping', () => {
    expect(wrapIndex(2, 1, 5)).toBe(3);
    expect(wrapIndex(2, -1, 5)).toBe(1);
  });

  it('stays at 0 for an empty list (no NaN from modulo by zero)', () => {
    expect(wrapIndex(0, -1, 0)).toBe(0);
  });
});
