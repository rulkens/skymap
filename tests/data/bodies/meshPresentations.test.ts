/**
 * The moons' presentations take their bounding radius from the baked asset, and
 * that radius is only the shape model's true maximum (Phobos 13.94 km, Deimos
 * 8.71 km, measured on the source) if the bake kept the centre-of-mass origin
 * and the km→m scale. A centroid recentre or a unit slip moves it.
 */

import { describe, expect, it } from 'vitest';

import { MESH_PRESENTATIONS } from '../../../src/data/bodies/meshPresentations';

describe('MESH_PRESENTATIONS shape models', () => {
  it.each([
    ['phobos', 13941],
    ['deimos', 8707],
  ])('%s is drawn from its own mesh at its measured outer radius', (id, radiusM) => {
    const row = MESH_PRESENTATIONS.find((p) => p.id === id);
    expect(row?.meshKey).toBe(id);
    expect(row!.boundingRadiusM).toBeGreaterThan(radiusM - 50);
    expect(row!.boundingRadiusM).toBeLessThan(radiusM + 50);
  });
});
