import { describe, it, expect } from 'vitest';
import { gridIndexStep } from '../../../../src/components/CommandPalette/utils/gridIndexStep';

// 5 columns, 12 cards → rows of 5, 5, 2 (a partial last row).
const COLUMNS = 5;
const COUNT = 12;

describe('gridIndexStep', () => {
  it('right from the last card wraps to the first', () => {
    expect(gridIndexStep(11, 'ArrowRight', COLUMNS, COUNT)).toBe(0);
  });

  it('down from row 1 column 4 lands on the last card of a partial row', () => {
    expect(gridIndexStep(8, 'ArrowDown', COLUMNS, COUNT)).toBe(11);
  });

  it('down from the last row wraps to the same column on top', () => {
    expect(gridIndexStep(10, 'ArrowDown', COLUMNS, COUNT)).toBe(0);
    expect(gridIndexStep(11, 'ArrowDown', COLUMNS, COUNT)).toBe(1);
  });

  it('up from the top row lands in the last row that has that column', () => {
    expect(gridIndexStep(1, 'ArrowUp', COLUMNS, COUNT)).toBe(11);
    expect(gridIndexStep(3, 'ArrowUp', COLUMNS, COUNT)).toBe(8);
  });
});
