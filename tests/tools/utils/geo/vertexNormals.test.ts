import { describe, expect, it } from 'vitest';

import { icosphere } from '../../../../tools/utils/geo/icosphere';
import { vertexNormals } from '../../../../tools/utils/geo/vertexNormals';

describe('vertexNormals', () => {
  it('of a unit icosphere point radially outward', () => {
    // The shader takes abs(dot(n, v)), so an inward winding wouldn't invert
    // the Fresnel term — this instead catches wrong-vertex accumulation or a
    // bad normalisation, both of which pull the dot away from 1.
    const { directions, faces } = icosphere(2);
    const normals = vertexNormals(directions, faces);
    for (let i = 0; i < directions.length; i++) {
      const position = directions[i]!;
      const normal = normals[i]!;
      const dot = position[0] * normal[0] + position[1] * normal[1] + position[2] * normal[2];
      expect(Math.abs(dot)).toBeGreaterThan(0.99);
    }
  });
});
