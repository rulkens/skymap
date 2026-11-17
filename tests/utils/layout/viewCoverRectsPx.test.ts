import { describe, expect, it } from 'vitest';

import { viewCoverRectsPx } from '../../../src/utils/layout/viewCoverRectsPx';

describe('viewCoverRectsPx', () => {
  it('scales CSS-measured covers onto a device-pixel canvas, right edges included', () => {
    const rects = viewCoverRectsPx(
      { infoCard: { edge: 'right', reachPx: 300, spanPx: [10, 410] } },
      [3200, 1800],
      1600,
    );
    expect(rects).toEqual([{ x0: 2600, y0: 20, x1: 3200, y1: 820 }]);
  });
});
