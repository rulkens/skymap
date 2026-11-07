import { describe, expect, it } from 'vitest';

import { viewCoverRect } from '../../../src/utils/layout/viewCoverRect';

const canvas = [1200, 800] as const;

describe('viewCoverRect', () => {
  it('anchors each edge at the canvas side and lays the span along it', () => {
    const span = [100, 300] as const;
    expect(viewCoverRect({ edge: 'left', reachPx: 50, spanPx: span }, canvas)).toEqual({
      x0: 0,
      y0: 100,
      x1: 50,
      y1: 300,
    });
    expect(viewCoverRect({ edge: 'right', reachPx: 50, spanPx: span }, canvas)).toEqual({
      x0: 1150,
      y0: 100,
      x1: 1200,
      y1: 300,
    });
    expect(viewCoverRect({ edge: 'top', reachPx: 50, spanPx: span }, canvas)).toEqual({
      x0: 100,
      y0: 0,
      x1: 300,
      y1: 50,
    });
    expect(viewCoverRect({ edge: 'bottom', reachPx: 50, spanPx: span }, canvas)).toEqual({
      x0: 100,
      y0: 750,
      x1: 300,
      y1: 800,
    });
  });
});
