import { wrapIndex } from './wrapIndex';

/**
 * gridIndexStep — move the featured grid's keyboard highlight by one arrow
 * press. Only the grid's LAST row can be short (a row-major grid fills every
 * earlier row completely), so the two edges need different handling: ↓ into
 * a missing cell of a partial last row lands on the final card rather than
 * wrapping past it, while ↑ off the top skips straight to the nearest row
 * that actually has the pressed column.
 */
export function gridIndexStep(index: number, key: string, columns: number, count: number): number {
  if (key === 'ArrowLeft') return wrapIndex(index, -1, count);
  if (key === 'ArrowRight') return wrapIndex(index, 1, count);

  const numRows = Math.ceil(count / columns);
  const row = Math.floor(index / columns);
  const col = index % columns;

  if (key === 'ArrowDown') {
    const nextRow = row + 1 >= numRows ? 0 : row + 1;
    const candidate = nextRow * columns + col;
    return candidate < count ? candidate : count - 1;
  }

  // ArrowUp: every row but the last is full, so moving up from row > 0 always
  // lands on a card; only wrapping off row 0 into a partial last row can land
  // on a missing cell — fall back one row further when it does.
  if (row > 0) return (row - 1) * columns + col;
  const lastRow = numRows - 1;
  const wrapped = lastRow * columns + col;
  return wrapped < count ? wrapped : (lastRow - 1) * columns + col;
}
