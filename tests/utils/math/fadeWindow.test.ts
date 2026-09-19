/**
 * fadeWindow — the product-of-bands composition, pinned against an
 * approach band feeding into a recede band (the ZoA shape): full strength
 * only inside the overlap, gone on either side.
 */

import { describe, it, expect } from 'vitest';

import { fadeWindow } from '../../../src/utils/math/fadeWindow';

describe('fadeWindow', () => {
  const approach = { fullAt: 2, goneAt: 1 };
  const recede = { fullAt: 4, goneAt: 8 };

  it('is 0 below the in-band, 1 inside the window, 0 past the out-band', () => {
    expect(fadeWindow([approach, recede], 0.5)).toBe(0);
    expect(fadeWindow([approach, recede], 3)).toBe(1);
    expect(fadeWindow([approach, recede], 10)).toBe(0);
  });

  it('of no bands is 1', () => {
    expect(fadeWindow([], 42)).toBe(1);
  });
});
