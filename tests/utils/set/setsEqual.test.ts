import { describe, it, expect } from 'vitest';
import { setsEqual } from '../../../src/utils/set/setsEqual';

describe('setsEqual', () => {
  it('is true for the same members in a different object and insertion order', () => {
    expect(setsEqual(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
  });

  it('is false when one set has a member the other lacks, at equal size', () => {
    expect(setsEqual(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(false);
  });

  it('is false when sizes differ', () => {
    expect(setsEqual(new Set(['a']), new Set(['a', 'b']))).toBe(false);
    expect(setsEqual(new Set(), new Set(['a']))).toBe(false);
  });
});
