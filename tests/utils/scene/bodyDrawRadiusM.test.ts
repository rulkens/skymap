import { describe, it, expect } from 'vitest';
import { bodyDrawRadiusM } from '../../../src/utils/scene/bodyDrawRadiusM';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';

const findPlanet = (id: string) => {
  const body = SCENE_PLANETS.find((row) => row.id === id);
  if (body === undefined) throw new Error(`test fixture: no seeded body '${id}'`);
  return body;
};

describe('bodyDrawRadiusM', () => {
  it('returns the bare radius for a body with no shells', () => {
    // Mimas: no ATMOSPHERE_PARAMS row, not Earth (cloud shell), not Saturn (ring).
    const mimas = findPlanet('mimas');
    expect(bodyDrawRadiusM(mimas)).toBe(mimas.radiusM);
  });

  it("returns Saturn's ring outer edge", () => {
    const saturn = findPlanet('saturn');
    // Hand-computed from sceneRings.ts:36 — outerRadiusKm 140_220 → metres.
    const result = bodyDrawRadiusM(saturn);
    expect(result).toBe(140_220_000);
    expect(result).toBeGreaterThan(saturn.radiusM);
  });

  it("returns Earth's atmosphere top, not its cloud shell", () => {
    // Hand-computed: EARTH_RADIUS_KM (6371) + 100 = 6471 km → 6_471_000 m
    // (atmosphereParams.ts:30-35). Must beat the cloud shell, radiusM * 1.002 =
    // 6_383_742 m — a missing km->m conversion on the atmosphere branch would
    // make the cloud shell win instead, a 1000x wrong near plane.
    const result = bodyDrawRadiusM(SCENE_EARTH);
    expect(result).toBe(6_471_000);
    expect(result).toBeGreaterThan(SCENE_EARTH.radiusM * 1.002);
  });
});
