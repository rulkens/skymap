import { describe, expect, it } from 'vitest';

import { icosphere } from '../../../../tools/utils/geo/icosphere';
import { vertexNormals } from '../../../../tools/utils/geo/vertexNormals';

describe('vertexNormals', () => {
  it('of a unit icosphere point radially outward', () => {
    // A winding flip would turn every normal inward, which would invert the
    // Fresnel term (`pow(1 - |N·V|, 3)`) — this catches that class of bug.
    const { directions, faces } = icosphere(2);
    const normals = vertexNormals(directions, faces);
    for (let i = 0; i < directions.length; i++) {
      const position = directions[i]!;
      const normal = normals[i]!;
      const dot = position[0] * normal[0] + position[1] * normal[1] + position[2] * normal[2];
      expect(dot).toBeGreaterThan(0.99);
    }
  });
});
