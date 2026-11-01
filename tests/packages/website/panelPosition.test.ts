import { describe, expect, it } from 'vitest';

import { panelPosition } from '../../../packages/website/src/dev/feedback/panelPosition';

const panel = { width: 320, height: 200 };
const view = { width: 1000, height: 700 };

describe('panelPosition', () => {
  it('goes right of the area, level with its top, when there is room', () => {
    expect(panelPosition({ x: 100, y: 300, width: 200, height: 50 }, panel, view)).toEqual({
      x: 312,
      y: 300,
    });
  });

  it('goes left when the right is out of the window', () => {
    expect(panelPosition({ x: 700, y: 300, width: 200, height: 50 }, panel, view).x).toBe(368);
  });

  it('goes under a wide area, else above it, when neither side has room', () => {
    const wide = { x: 8, y: 100, width: 984, height: 100 };
    expect(panelPosition(wide, panel, view)).toEqual({ x: 8, y: 212 });
    expect(panelPosition({ ...wide, y: 450 }, panel, view)).toEqual({ x: 8, y: 238 });
  });

  it('never leaves the window', () => {
    const { x, y } = panelPosition({ x: 990, y: 695, width: 4, height: 4 }, panel, view);
    expect(x).toBeLessThanOrEqual(view.width - panel.width - 8);
    expect(y).toBeLessThanOrEqual(view.height - panel.height - 8);
  });
});
