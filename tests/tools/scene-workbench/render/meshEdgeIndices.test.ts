import { describe, expect, it } from 'vitest';

import { meshEdgeIndices } from '../../../../tools/scene-workbench/src/render/meshEdgeIndices';

describe('meshEdgeIndices', () => {
  it('classifies a shared edge as manifold and the quad border as open', () => {
    // Two triangles sharing edge 1-2, whose two windings (1,2) and (2,1) must
    // collide on one key — the pairs are asserted exactly, so a key collapse
    // or a lost half of a group shows up as the wrong class, not a plausible
    // array.
    const { manifold, open } = meshEdgeIndices(new Uint32Array([0, 1, 2, 2, 1, 3]));

    expect([...manifold]).toEqual([1, 2]);
    expect([...open]).toEqual([0, 1, 0, 2, 1, 3, 2, 3]);
  });

  it('classifies an edge with three adjacent triangles as open', () => {
    // Non-manifold junction: counting "shared at all" instead of "shared by
    // exactly two" would call edge 0-1 manifold here.
    const { manifold, open } = meshEdgeIndices(new Uint32Array([0, 1, 2, 0, 1, 3, 0, 1, 4]));

    expect([...manifold]).toEqual([]);
    expect([...open]).toEqual([0, 1, 0, 2, 0, 3, 0, 4, 1, 2, 1, 3, 1, 4]);
  });
});
