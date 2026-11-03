import { describe, expect, it } from 'vitest';

import { triangleArea } from '../../../../tools/utils/meshes/triangleArea';

describe('triangleArea()', () => {
  it('reads vertex indices, not float offsets', () => {
    // Vertex 0 is a decoy; the 3-4-5 right triangle sits on vertices 1, 2, 3 off the z = 0 plane.
    const positions = new Float32Array([9, 9, 9, 0, 0, 1, 3, 0, 1, 0, 4, 1]);

    expect(triangleArea(positions, 1, 2, 3)).toBe(6);
  });
});
