/**
 * Only a fill's sea edge may lose vertices: the line two cells share must keep
 * every one, or the fill would drift off the border strip drawn from it; and a
 * small island must not collapse into a ring with no area.
 */

import { describe, it, expect } from 'vitest';

import type { CellTopology } from '../../../../../tools/antique/earth/@types/CellTopology';
import { simplifySeaEdges } from '../../../../../tools/antique/earth/utils/simplifySeaEdges';

const R = 6371;
// 0.01° ≈ 1 km of wiggle on both the shared line and the sea edge; c is a ~2 km island.
const TOPOLOGY: CellTopology = {
  arcs: [
    [
      [1, 0],
      [1.01, 0.5],
      [1, 1],
    ], // 0: a | b
    [
      [1, 1],
      [0, 1],
      [0.01, 0.5],
      [0, 0],
      [1, 0],
    ], // 1: a's sea edge
    [
      [1, 0],
      [2, 0],
      [1.99, 0.5],
      [2, 1],
      [1, 1],
    ], // 2: b's sea edge
    [
      [5, 5],
      [5.02, 5],
      [5.02, 5.02],
      [5, 5],
    ], // 3: c
  ],
  cells: [
    { key: 'a', polygons: [[[0, 1]]] },
    { key: 'b', polygons: [[[2, ~0]]] },
    { key: 'c', polygons: [[[3]]] },
  ],
};

describe('simplifySeaEdges', () => {
  it('keeps every vertex of a shared line and drops sea-edge wiggles under the tolerance', () => {
    const { arcs } = simplifySeaEdges(TOPOLOGY, 5, R);
    expect(arcs[0]).toEqual(TOPOLOGY.arcs[0]);
    expect(arcs[1]).toEqual([
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ]);
    expect(arcs[2]).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
    ]);
  });

  it('leaves an island smaller than the tolerance its outline', () => {
    expect(simplifySeaEdges(TOPOLOGY, 5, R).arcs[3]).toEqual(TOPOLOGY.arcs[3]);
  });
});
