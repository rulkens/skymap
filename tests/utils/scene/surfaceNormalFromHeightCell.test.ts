import { describe, expect, it } from 'vitest';

import { surfaceNormalFromHeightCell } from '../../../src/utils/scene/surfaceNormalFromHeightCell';

const ROOT_HALF = Math.SQRT1_2;

function expectClose(got: readonly number[], want: readonly number[]): void {
  for (let c = 0; c < 3; c++) expect(got[c]!).toBeCloseTo(want[c]!, 12);
}

/**
 * Sign flips are the bug class: the atlas's row index increases SOUTHWARD, so a
 * slope lit from the wrong side looks plausible in a screenshot and inverts
 * every hill into a pit under a moving sun.
 */
describe('surfaceNormalFromHeightCell', () => {
  it('is up on a flat cell', () => {
    expectClose(surfaceNormalFromHeightCell(7, 7, 7, 7, 0.3, 0.6, 20, 30), [0, 0, 1]);
  });

  it('tilts west on a 1:1 east slope', () => {
    expectClose(surfaceNormalFromHeightCell(0, 20, 0, 20, 0.3, 0.6, 20, 30), [
      -ROOT_HALF,
      0,
      ROOT_HALF,
    ]);
  });

  it('tilts south on a 1:1 north slope', () => {
    expectClose(surfaceNormalFromHeightCell(30, 30, 0, 0, 0.3, 0.6, 20, 30), [
      0,
      -ROOT_HALF,
      ROOT_HALF,
    ]);
  });

  it('interpolates between the cell’s two edge gradients', () => {
    // East slope 1 along the north row, 2 along the south row, over a 1 m cell.
    const atNorth = surfaceNormalFromHeightCell(0, 1, 0, 2, 0, 0, 1, 1);
    const atMid = surfaceNormalFromHeightCell(0, 1, 0, 2, 0, 0.5, 1, 1);
    expectClose(atNorth, [-ROOT_HALF, 0, ROOT_HALF]);
    const midLen = Math.hypot(1.5, 1);
    expectClose(atMid, [-1.5 / midLen, 0, 1 / midLen]);
  });
});
