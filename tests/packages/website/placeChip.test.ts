import { describe, expect, it } from 'vitest';

import { placeChip } from '../../../packages/website/src/dev/review/placeChip';

const chip = { width: 280, height: 28 };
const view = { width: 400, top: 72, bottom: 800 };
const line = (x: number, y: number, width: number) => ({ x, y, width, height: 20 });

describe('placeChip', () => {
  it('goes under the last line, starting where the selection ends', () => {
    const anchor = { first: line(20, 300, 100), last: line(20, 330, 60) };
    expect(placeChip(anchor, chip, view)).toEqual({ x: 80, y: 358 });
  });

  it('goes above the first line when the band has no room below', () => {
    const anchor = { first: line(20, 700, 100), last: line(20, 770, 60) };
    expect(placeChip(anchor, chip, view)).toEqual({ x: 20, y: 664 });
  });

  it('stays inside the window sideways, and below the bars when it has no room either way', () => {
    const anchor = { first: line(20, 80, 360), last: line(20, 780, 360) };
    const at = placeChip(anchor, chip, view);
    expect(at.x).toBe(400 - 280 - 8);
    expect(at.y).toBeGreaterThanOrEqual(80);
    expect(at.y + chip.height).toBeLessThanOrEqual(800 - 8);
  });
});
