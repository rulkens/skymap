/**
 * sortSplatOrder — the alpha-blend draw order. The bucket sort's keys are
 * camera-relative DEPTH, not distance to the eye, so the fixtures place
 * splats whose euclidean ordering disagrees with their depth ordering.
 */
import { describe, expect, it } from 'vitest';

import { sortSplatOrder } from '../../../../tools/scene-workbench/src/scene/sortSplatOrder';

describe('sortSplatOrder', () => {
  it('returns far-to-near order', () => {
    // Depth runs along +Y; the lateral offsets make index 0 the FARTHEST from
    // the eye by euclidean distance while it is the nearest in depth.
    const positionsM = new Float32Array(
      [
        [100, 1, 0],
        [10, 5, 0],
        [10, 3, 0],
        [-50, 2, 0],
        [10, 4, 0],
      ].flat(),
    );

    const order = sortSplatOrder(positionsM, [10, 0, 0], [0, 1, 0]);

    expect(Array.from(order)).toEqual([1, 4, 2, 3, 0]);
  });

  it('handles a splat behind the eye', () => {
    const positionsM = new Float32Array(
      [
        [0, 0, 1],
        [0, 0, -3],
        [0, 0, 5],
      ].flat(),
    );

    const order = sortSplatOrder(positionsM, [0, 0, 0], [0, 0, 1]);

    expect(Array.from(order)).toEqual([2, 0, 1]);
  });
});
