import { describe, expect, it } from 'vitest';
import { stuckLabelInset } from '../../../src/timeline/utils/stuckLabelInset';

// The inset is a CSS padding, so it is in percent of the track, like the bar's own left and width.
describe('stuckLabelInset', () => {
  it('is zero while the bar starts inside the window', () => {
    expect(stuckLabelInset(4, 8, { startSec: 0, endSec: 10 })).toBe(0);
  });

  it('puts the label at the window edge when the bar starts before it', () => {
    // Bar 4-8 s in a 7-9 s window: left is -150 %, so the label sits 150 % into the bar.
    expect(stuckLabelInset(4, 8, { startSec: 7, endSec: 9 })).toBe(150);
  });

  it('never reaches past the bar, so the bar keeps its own length', () => {
    // Bar 4-8 s, window 9-15 s: the bar ends off screen and must not stretch into view.
    expect(stuckLabelInset(4, 8, { startSec: 9, endSec: 15 })).toBeCloseTo(400 / 6);
    // A zero-length fade at 2 s in a 2.6 s window stays a pill at 2 s.
    expect(stuckLabelInset(2, 2, { startSec: 2.6, endSec: 8.6 })).toBe(0);
  });
});
