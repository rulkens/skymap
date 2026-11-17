/** A reversed arc (`~i`) must be walked backwards and each junction kept once,
 * or a fill ring would double back on itself at every node. */

import { describe, it, expect } from 'vitest';

import type { CellTopology } from '../../../../../tools/antique/earth/@types/CellTopology';
import { cellTopologyToCells } from '../../../../../tools/antique/earth/utils/cellTopologyToCells';

describe('cellTopologyToCells', () => {
  it('joins forward and reversed arcs into closed rings', () => {
    const topology: CellTopology = {
      arcs: [
        [
          [1, 0],
          [1, 1],
        ],
        [
          [1, 1],
          [0, 1],
          [0, 0],
          [1, 0],
        ],
        [
          [1, 0],
          [2, 0],
          [2, 1],
          [1, 1],
        ],
      ],
      cells: [
        { key: 'a', polygons: [[[0, 1]]] },
        { key: 'b', polygons: [[[2, ~0]]] },
      ],
    };
    expect(cellTopologyToCells(topology)).toEqual([
      {
        key: 'a',
        polygons: [
          [
            [
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
              [1, 0],
            ],
          ],
        ],
      },
      {
        key: 'b',
        polygons: [
          [
            [
              [1, 0],
              [2, 0],
              [2, 1],
              [1, 1],
              [1, 0],
            ],
          ],
        ],
      },
    ]);
  });
});
