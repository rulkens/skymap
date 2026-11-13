/**
 * Border rank sets each line's dots, width and reveal level, so a province
 * line must not come out as a realm border; lines against unclaimed land are
 * not borders at all; a realm border runs on through the corner where a
 * province line leaves it; ends on a coast are flagged for the run out to sea.
 *
 *   y=2  +----------+---------+
 *        |  a (X)   |  c (Y)  |
 *   y=1  +----------+         |      a, b: provinces of realm X; c: realm Y;
 *        |  b (X)   |         |      u: unclaimed. Coast along the outside
 *   y=0  +----------+---------+      except where u sits below b and c.
 *        |        u           |
 *  y=-1  +--------------------+
 *        x=0       x=1       x=2
 */

import { describe, it, expect } from 'vitest';

import type { CellTopology } from '../../../../../tools/antique/earth/@types/CellTopology';
import { borderPolylines } from '../../../../../tools/antique/earth/utils/borderPolylines';

const ARCS: CellTopology['arcs'] = [
  [[0, 1], [1, 1]], // 0: a | b
  [[1, 2], [1, 1]], // 1: a | c
  [[1, 1], [1, 0]], // 2: b | c
  [[0, 0], [1, 0]], // 3: b | u
  [[1, 0], [2, 0]], // 4: c | u
  [[0, 1], [0, 2], [1, 2]], // 5: a's coast
  [[1, 2], [2, 2], [2, 0]], // 6: c's coast
  [[0, 0], [0, 1]], // 7: b's coast
  [[2, 0], [2, -1], [0, -1], [0, 0]], // 8: u's coast
];
const TOPOLOGY: CellTopology = {
  arcs: ARCS,
  cells: [
    { key: 'a', polygons: [[[0, ~1, ~5]]] },
    { key: 'b', polygons: [[[3, ~2, ~0, ~7]]] },
    { key: 'c', polygons: [[[4, ~6, 1, 2]]] },
    { key: 'u', polygons: [[[~8, ~4, ~3]]] },
  ],
};
const realm: Record<string, string> = { a: 'X', b: 'X', c: 'Y' };
const rankOf = (p: string, q: string) =>
  p === 'u' || q === 'u' ? 0 : realm[p] === realm[q] ? 3 : 1;

describe('borderPolylines', () => {
  const lines = borderPolylines(TOPOLOGY, rankOf);

  it('ranks the province line 3, the realm border 1, and leaves unclaimed land unbordered', () => {
    expect(lines.map((l) => l.rank).sort()).toEqual([1, 3]);
    expect(lines.find((l) => l.rank === 3)!.points).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it('runs the realm border on through the corner the province line leaves', () => {
    const border = lines.find((l) => l.rank === 1)!;
    expect(border.points).toHaveLength(3);
    expect(border.points).toContainEqual([1, 1]);
  });

  it('flags the realm border coastal only where it meets the sea', () => {
    const border = lines.find((l) => l.rank === 1)!;
    const atTop = border.points[0]![1] === 2;
    // The top end (1, 2) is a coast; the bottom end (1, 0) meets unclaimed land.
    expect(border.coastal).toEqual(atTop ? [true, false] : [false, true]);
    expect(lines.find((l) => l.rank === 3)!.coastal).toEqual([true, false]);
  });
});
