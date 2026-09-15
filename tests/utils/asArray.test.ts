import { describe, it, expect } from 'vitest';

import { asArray } from '../../src/utils/asArray';

describe('asArray', () => {
  it('passes an array through with the same elements', () => {
    expect(asArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('collapses null to the empty array', () => {
    expect(asArray(null)).toEqual([]);
  });
});
