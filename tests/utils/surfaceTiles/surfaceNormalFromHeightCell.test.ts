import { describe, expect, it } from 'vitest';

import { surfaceNormalFromHeightCell } from '../../../src/utils/surfaceTiles/surfaceNormalFromHeightCell';

const ROOT_HALF = Math.SQRT1_2;
const CELLS = 128;

function expectClose(got: readonly number[], want: readonly number[]): void {
  for (let c = 0; c < 3; c++) expect(got[c]!).toBeCloseTo(want[c]!, 12);
}

/** Height as a function of post column (east) and row (south). */
function lattice(h: (col: number, row: number) => number) {
  return (col: number, row: number) => h(col, row);
}

/**
 * Sign flips are the bug class: the atlas's row index increases SOUTHWARD, so a
 * slope lit from the wrong side looks plausible in a screenshot and inverts
 * every hill into a pit under a moving sun. Continuity across a post line is
 * the other: a normal that jumps there draws every height cell as a facet.
 */
describe('surfaceNormalFromHeightCell', () => {
  it('is up on a flat lattice', () => {
    const n = surfaceNormalFromHeightCell(
      lattice(() => 7),
      5,
      9,
      CELLS,
      0.3,
      0.6,
      20,
      30,
    );
    expectClose(n, [0, 0, 1]);
  });

  it('tilts west on a 1:1 east slope', () => {
    const n = surfaceNormalFromHeightCell(
      lattice((col) => 20 * col),
      5,
      9,
      CELLS,
      0.3,
      0.6,
      20,
      30,
    );
    expectClose(n, [-ROOT_HALF, 0, ROOT_HALF]);
  });

  it('tilts south on a 1:1 north slope', () => {
    const n = surfaceNormalFromHeightCell(
      lattice((_, row) => -30 * row),
      5,
      9,
      CELLS,
      0.3,
      0.6,
      20,
      30,
    );
    expectClose(n, [0, -ROOT_HALF, ROOT_HALF]);
  });

  it('is continuous across a post line', () => {
    // A parabola: the cell gradient differs on the two sides of post 6, the
    // post's own central difference does not.
    const parabola = lattice((col) => col * col);
    const westOfPost = surfaceNormalFromHeightCell(parabola, 5, 0, CELLS, 1, 0.4, 1, 1);
    const eastOfPost = surfaceNormalFromHeightCell(parabola, 6, 0, CELLS, 0, 0.4, 1, 1);
    expectClose(westOfPost, eastOfPost);
    // And is the true slope there (12 per post), not a forward difference's 13.
    const len = Math.hypot(12, 1);
    expectClose(eastOfPost, [-12 / len, 0, 1 / len]);
  });

  it('goes one-sided at the sub-rect edge instead of reading past it', () => {
    // Posts outside 0..CELLS throw: the lattice is another leaf's ground.
    const guarded = (col: number, row: number): number => {
      if (col < 0 || col > CELLS || row < 0 || row > CELLS) throw new Error(`read ${col},${row}`);
      return 20 * col;
    };
    expectClose(surfaceNormalFromHeightCell(guarded, 0, 0, CELLS, 0, 0, 20, 30), [
      -ROOT_HALF,
      0,
      ROOT_HALF,
    ]);
    expectClose(surfaceNormalFromHeightCell(guarded, CELLS - 1, CELLS - 1, CELLS, 1, 1, 20, 30), [
      -ROOT_HALF,
      0,
      ROOT_HALF,
    ]);
  });
});
