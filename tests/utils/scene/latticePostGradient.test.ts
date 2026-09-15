import { describe, expect, it } from 'vitest';

import { latticePostGradient } from '../../../src/utils/scene/latticePostGradient';

const CELLS = 128;

describe('latticePostGradient', () => {
  it('is the central difference over two posts inside the sub-rect', () => {
    // h = col² + 3·row: east slope 2·col exactly by symmetry, north slope −3
    // (rows count south).
    const g = latticePostGradient((col, row) => col * col + 3 * row, 10, 7, CELLS);
    expect(g[0]).toBe(20);
    expect(g[1]).toBe(-3);
  });

  it('goes one-sided on the sub-rect edge, never reading past it', () => {
    const guarded = (col: number, row: number): number => {
      if (col < 0 || col > CELLS || row < 0 || row > CELLS) throw new Error(`read ${col},${row}`);
      return col * col + 3 * row;
    };
    expect(latticePostGradient(guarded, 0, 0, CELLS)).toEqual([1, -3]);
    expect(latticePostGradient(guarded, CELLS, CELLS, CELLS)).toEqual([2 * CELLS - 1, -3]);
  });

  it('survives a one-cell sub-rect (a leaf seven levels up its ancestor)', () => {
    expect(latticePostGradient((col) => 5 * col, 1, 0, 1)).toEqual([5, 0]);
  });
});
