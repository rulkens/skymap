import { describe, it, expect } from 'vitest';
import { findByIdOrThrow } from '../../../src/utils/object/findByIdOrThrow';

describe('findByIdOrThrow', () => {
  const table = [
    { id: 'a', value: 1 },
    { id: 'b', value: 2 },
  ];

  it('returns the entry whose id matches', () => {
    expect(findByIdOrThrow(table, 'b', 'ctx')).toBe(table[1]);
  });

  it('throws naming the context and the missing id', () => {
    expect(() => findByIdOrThrow(table, 'z', 'myTable')).toThrow(/myTable.*'z'/);
  });
});
