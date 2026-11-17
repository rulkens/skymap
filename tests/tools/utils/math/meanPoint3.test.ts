import { describe, expect, it } from 'vitest';

import { meanPoint3 } from '../../../../tools/utils/math/meanPoint3';

describe('meanPoint3', () => {
  it('averages each axis on its own', () => {
    expect(
      meanPoint3([
        [0, 2, -4],
        [2, 4, 0],
        [4, 0, 1],
      ]),
    ).toEqual([2, 2, -1]);
  });
});
