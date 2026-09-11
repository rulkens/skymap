import { describe, expect, it } from 'vitest';

import { meshEdgeIndices } from '../../../../tools/scene-workbench/src/render/meshEdgeIndices';

describe('meshEdgeIndices', () => {
  it('expands each triangle into its three edges, winding order preserved', () => {
    // Two triangles sharing edge 1-2: the shared edge appears once per
    // triangle (undeduped by design), so a wrong stride shows up as a
    // missing or transposed pair rather than a plausible-looking array.
    const edges = meshEdgeIndices(new Uint32Array([0, 1, 2, 2, 1, 3]));

    expect([...edges]).toEqual([0, 1, 1, 2, 2, 0, 2, 1, 1, 3, 3, 2]);
  });
});
