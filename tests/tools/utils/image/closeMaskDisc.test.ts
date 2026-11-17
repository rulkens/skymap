import { describe, expect, it } from 'vitest';

import { closeMaskDisc } from '../../../../tools/utils/image/closeMaskDisc';

describe('closeMaskDisc', () => {
  it('bridges a narrow gap but does not grow a shape that touches the plane edge', () => {
    const W = 30;
    const H = 12;
    const m = new Uint8Array(W * H);
    // A band from x = 3 to the right edge, with a 3 px gap at x = 12..14; x = 0..2 stay paper.
    for (let y = 0; y < 4; y++) for (let x = 3; x < W; x++) if (x < 12 || x > 14) m[y * W + x] = 1;
    const closed = closeMaskDisc(m, W, H, 4);
    for (let x = 12; x <= 14; x++) expect(closed[1 * W + x]).toBe(1);
    for (let x = 0; x < 3; x++) expect(closed[1 * W + x]).toBe(0);
    for (let y = 5; y < H; y++) for (let x = 0; x < W; x++) expect(closed[y * W + x]).toBe(0);
  });
});
