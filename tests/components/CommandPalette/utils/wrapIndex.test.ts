import { describe, it, expect } from 'vitest';
import { wrapIndex } from '../../../../src/components/CommandPalette/utils/wrapIndex';

describe('wrapIndex', () => {
  it('wraps past the top to the last index', () => {
    expect(wrapIndex(0, -1, 5)).toBe(4);
  });

  it('stays at 0 for an empty list (no NaN from modulo by zero)', () => {
    expect(wrapIndex(0, -1, 0)).toBe(0);
  });
});
