import { describe, expect, it } from 'vitest';

import type { Vec2 } from '../../../../src/@types/math/Vec2';
import { ringEdgeInsertion } from '../../../../tools/scene-workbench/src/scene/ringEdgeInsertion';

// A 100 px square, corners clockwise on screen.
const SQUARE: Vec2[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
const EDGE_PX = 6;
const GAP_PX = 8;

describe('ringEdgeInsertion', () => {
  it('inserts after the edge start, at the foot of the perpendicular', () => {
    expect(ringEdgeInsertion(SQUARE, true, [50, 4], EDGE_PX, GAP_PX)).toEqual({
      index: 1,
      footPx: [50, 0],
    });
  });

  it('reaches the closing edge only on a closed ring', () => {
    expect(ringEdgeInsertion(SQUARE, true, [3, 50], EDGE_PX, GAP_PX)).toEqual({
      index: 4,
      footPx: [0, 50],
    });
    expect(ringEdgeInsertion(SQUARE, false, [3, 50], EDGE_PX, GAP_PX)).toBeNull();
  });

  it('refuses a foot closer than the gap to either end corner', () => {
    expect(ringEdgeInsertion(SQUARE, true, [95, 2], EDGE_PX, GAP_PX)).toBeNull();
  });

  it('ignores a click farther than the edge radius', () => {
    expect(ringEdgeInsertion(SQUARE, true, [50, 20], EDGE_PX, GAP_PX)).toBeNull();
  });
});
