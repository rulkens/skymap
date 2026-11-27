import { describe, expect, it } from 'vitest';

import { playFrom } from '../../../src/session/utils/playFrom';

describe('playFrom', () => {
  it('restarts at 0 at End and at the loop start outside the loop', () => {
    expect(playFrom(3, 8, null)).toBe(3);
    expect(playFrom(8, 8, null)).toBe(0);
    expect(playFrom(9, 8, null)).toBe(0);
    const loop = { startSec: 2, endSec: 4 };
    expect(playFrom(3, 8, loop)).toBe(3);
    expect(playFrom(1, 8, loop)).toBe(2);
    expect(playFrom(4, 8, loop)).toBe(2);
  });
});
