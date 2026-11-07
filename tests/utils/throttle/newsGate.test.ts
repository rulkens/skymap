import { describe, it, expect } from 'vitest';

import { newsGate } from '../../../src/utils/throttle/newsGate';

describe('newsGate', () => {
  it('compares against the last value it passed, not the last one offered', () => {
    const gate = newsGate<number>((a, b) => Math.abs(a - b) > 1, 0);
    expect(gate(0.6)).toBe(false);
    expect(gate(1.2)).toBe(true);
    expect(gate(2.0)).toBe(false);
    // Only 0.3 past the offered 2.0, but 1.1 past the passed 1.2: slow drift still reports.
    expect(gate(2.3)).toBe(true);
  });
});
