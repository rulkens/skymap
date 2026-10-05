import { describe, expect, it } from 'vitest';

import { uvCoverage } from '../../../../tools/scene-recon/crop/uvCoverage';

describe('uvCoverage', () => {
  it('uvCoverage of two triangles tiling the lower-left quarter is 0.25', () => {
    const uvs = new Float32Array([0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5]);
    // Opposite windings on purpose: UV winding is not a coverage sign.
    const indices = new Uint32Array([0, 1, 2, 0, 3, 2]);

    expect(uvCoverage(uvs, indices)).toBeCloseTo(0.25, 9);
  });
});
