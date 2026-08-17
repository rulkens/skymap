/**
 * pointVertexLayout — the shared vertex-attribute layout export.
 *
 * `POINT_VERTEX_ATTRIBUTES` + `POINT_STRIDE` are the single source of truth
 * that `pointRenderer`, `pickRenderer`, and the `points/*.wesl` shaders must
 * agree on byte-for-byte. This test pins the exact shape so a silent edit to
 * the table can't drift one pipeline's attribute wiring away from the others.
 */

import { describe, it, expect } from 'vitest';

describe('POINT_VERTEX_ATTRIBUTES — shared layout export', () => {
  it('has 11 attributes with the expected shader locations and formats', async () => {
    const { POINT_VERTEX_ATTRIBUTES, POINT_STRIDE } =
      await import('../../../../../src/services/gpu/renderers/galaxyCatalog/pointVertexLayout');

    expect(POINT_STRIDE).toBe(56);
    expect(POINT_VERTEX_ATTRIBUTES).toHaveLength(11);

    // Location 0 is the position vec3, location 4 is the baked (paCos,
    // paSin) vec2; everything else is a scalar f32.  Anyone editing
    // pointRenderer's table must update this expectation deliberately,
    // which is the point — a silent shape change here would break the
    // shared invariant with pickRenderer.
    expect(POINT_VERTEX_ATTRIBUTES[0]).toEqual({
      shaderLocation: 0,
      offset: 0,
      format: 'float32x3',
    });
    expect(POINT_VERTEX_ATTRIBUTES[4]).toEqual({
      shaderLocation: 4,
      offset: 24,
      format: 'float32x2',
    });

    const scalarExpectations: readonly { location: number; offset: number }[] = [
      { location: 1, offset: 12 }, // magnitude
      { location: 2, offset: 16 }, // colorIndex
      { location: 3, offset: 20 }, // axisRatio
      { location: 5, offset: 32 }, // radiusMpc
      { location: 6, offset: 36 }, // vMaxWeight
      { location: 7, offset: 40 }, // schechterRatio
      { location: 8, offset: 44 }, // angularDensityWeight
      { location: 9, offset: 48 }, // absMag
      { location: 10, offset: 52 }, // sbAmp
    ];
    for (const { location, offset } of scalarExpectations) {
      expect(POINT_VERTEX_ATTRIBUTES[location]).toEqual({
        shaderLocation: location,
        offset,
        format: 'float32',
      });
    }
  });
});
