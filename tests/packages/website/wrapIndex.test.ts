import { describe, expect, it } from 'vitest';

import { wrapIndex } from '../../../packages/website/src/utils/wrapIndex';

describe('wrapIndex', () => {
  it.each([
    [0, 6, 0],
    [5, 6, 5],
    [6, 6, 0],
    [-1, 6, 5],
    [-7, 6, 5],
    [13, 6, 1],
  ])('%i of %i is %i', (index, count, expected) => {
    expect(wrapIndex(index, count)).toBe(expected);
  });
});
