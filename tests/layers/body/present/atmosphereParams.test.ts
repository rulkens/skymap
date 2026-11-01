import { describe, it, expect } from 'vitest';
import { ATMOSPHERE_PARAMS } from '../../../../src/layers/body/present/atmosphereParams';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';

/**
 * Structural drift-catchers (spec §10): they iterate the whole table, so new rows are covered.
 * They assert only what the compiler cannot (a top below the surface, a key resolving to no seeded
 * body) and never restate the eye-tuned coefficients.
 */
describe('ATMOSPHERE_PARAMS', () => {
  it('keeps every row atmosphere top above its ground radius', () => {
    for (const [id, p] of Object.entries(ATMOSPHERE_PARAMS)) {
      expect(p.atmosphereTopKm, id).toBeGreaterThan(p.planetRadiusKm);
    }
  });

  it('resolves every key to a real seeded body', () => {
    // A typo'd id would silently never render (no row, no error).
    const seeded = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((b) => b.id)]);
    for (const id of Object.keys(ATMOSPHERE_PARAMS)) {
      expect(seeded.has(id), id).toBe(true);
    }
  });
});
