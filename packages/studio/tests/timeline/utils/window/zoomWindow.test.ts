import { describe, expect, it } from 'vitest';
import { zoomWindow } from '../../../../src/timeline/utils/window/zoomWindow';

const FIT = { startSec: 0, endSec: 120 };

describe('zoomWindow', () => {
  it('zooming in keeps a visible playhead at its place on screen', () => {
    // The head sits a quarter of the way across; it stays a quarter across.
    expect(zoomWindow(FIT, FIT, 0.5, 30)).toEqual({ startSec: 15, endSec: 75 });
  });

  it('centres on a playhead that is off screen', () => {
    expect(zoomWindow({ startSec: 0, endSec: 40 }, FIT, 0.5, 70)).toEqual({
      startSec: 60,
      endSec: 80,
    });
  });

  it('clamps to the clip and keeps the head in view near its end', () => {
    const window = zoomWindow({ startSec: 0, endSec: 40 }, FIT, 0.5, 119)!;
    expect(window).toEqual({ startSec: 100, endSec: 120 });
    expect(119).toBeGreaterThanOrEqual(window.startSec);
  });

  it('zooming out to the whole clip is Fit', () => {
    expect(zoomWindow({ startSec: 10, endSec: 70 }, FIT, 2, 30)).toBeNull();
  });
});
