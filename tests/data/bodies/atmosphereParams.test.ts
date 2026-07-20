import { describe, it, expect } from 'vitest';
import { ATMOSPHERE_PARAMS } from '../../../src/data/bodies/atmosphereParams';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';

/**
 * Structural drift-catchers (spec §10). These iterate the whole table, so they
 * cover the Earth row and every new atmosphere row and won't break when a
 * legitimate row is added. They assert only what the compiler cannot: a
 * fat-fingered top below the surface, or a key that resolves to no seeded body.
 * NO numeric restatement of the eye-tuned coefficients — those are tunable data.
 */
describe('ATMOSPHERE_PARAMS', () => {
  it('keeps every row atmosphere top above its ground radius', () => {
    // A top authored below the surface would float the limb inside the ground
    // sphere — a mistake the types cannot catch.
    for (const [id, p] of Object.entries(ATMOSPHERE_PARAMS)) {
      expect(p.atmosphereTopKm, id).toBeGreaterThan(p.planetRadiusKm);
    }
  });

  it('resolves every key to a real seeded body', () => {
    // A typo'd id would silently never render (no row, no error). Seeded ids =
    // SCENE_PLANETS ids + SCENE_EARTH.id.
    const seeded = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((b) => b.id)]);
    for (const id of Object.keys(ATMOSPHERE_PARAMS)) {
      expect(seeded.has(id), id).toBe(true);
    }
  });
});
