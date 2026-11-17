/**
 * A sliver part (here c's lens between a and b) that simplification collapses
 * must not leave a and b with two coincident one-cell arcs: borderPolylines
 * would read them as coast (no border, and a spike run "out to sea" inland),
 * and the colouring would not see a and b as neighbours.
 *
 *        a       | lens c |       b          c's main part sits far east
 *   x = 0..1    1 ... 1.006    1.006..2
 */

import { describe, it, expect } from 'vitest';

import type { RealmCell } from '../../../../../tools/antique/earth/@types/RealmCell';
import { cellNeighbours } from '../../../../../tools/antique/earth/utils/cellNeighbours';
import { simplifyCellCoverage } from '../../../../../tools/antique/earth/utils/simplifyCellCoverage';

const P: [number, number] = [1, 0];
const Q: [number, number] = [1, 1];
const LEFT: [number, number] = [1.003, 0.5];
const RIGHT: [number, number] = [1.006, 0.5];

const CELLS: RealmCell[] = [
  { key: 'a', polygons: [[[[0, 0], P, LEFT, Q, [0, 1], [0, 0]]]] },
  { key: 'b', polygons: [[[P, [2, 0], [2, 1], Q, RIGHT, P]]] },
  {
    key: 'c',
    polygons: [
      [[P, RIGHT, Q, LEFT, P]],
      [
        [
          [5, 0],
          [6, 0],
          [6, 1],
          [5, 1],
          [5, 0],
        ],
      ],
    ],
  },
];

describe('simplifyCellCoverage', () => {
  it('lets the cells either side of a collapsed sliver share their line', async () => {
    const { topology } = await simplifyCellCoverage(CELLS, 1);
    expect(cellNeighbours(topology).get('a')?.has('b')).toBe(true);
  });
});
