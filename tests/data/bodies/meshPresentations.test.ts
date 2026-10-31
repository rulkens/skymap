/**
 * The shape models' presentations take their bounding radius from the baked
 * asset, and that radius is only the shape model's true maximum (measured on the
 * source: Phobos 13.94 km, Bennu 291.5 m) if the bake kept the centre-of-mass
 * origin and the km→m scale. A centroid recentre or a unit slip moves it; the
 * tolerance is relative because the five span three orders of magnitude.
 */

import { describe, expect, it } from 'vitest';

import { MESH_PRESENTATIONS } from '../../../src/data/bodies/meshPresentations';

describe('MESH_PRESENTATIONS shape models', () => {
  it.each([
    ['phobos', 13941],
    ['deimos', 8707],
    ['vesta', 292377],
    ['ceres', 487013],
    ['bennu', 291.466],
  ])('%s is drawn from its own mesh at its measured outer radius', (id, radiusM) => {
    const row = MESH_PRESENTATIONS.find((p) => p.id === id);
    expect(row?.meshKey).toBe(id);
    expect(Math.abs(row!.boundingRadiusM / radiusM - 1)).toBeLessThan(0.004);
  });
});
