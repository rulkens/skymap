import { describe, it, expect } from 'vitest';
import { bodyDrawRadiusM } from '../../../src/utils/scene/bodyDrawRadiusM';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { ATMOSPHERE_PARAMS } from '../../../src/data/bodies/atmosphereParams';
import { CLOUD_SHELL_PARAMS } from '../../../src/data/bodies/cloudShellParams';
import { outerBoundRadiusM } from '../../../src/utils/occlusion/outerBoundRadiusM';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

const findPlanet = (id: string) => {
  const body = SCENE_PLANETS.find((row) => row.id === id);
  if (body === undefined) throw new Error(`test fixture: no seeded body '${id}'`);
  return body;
};

// distM/pxPerRad are unread by every fixture below — a fixed stand-in keeps
// them from restating view math they don't exercise.
const DIST_M = 1e9;
const PX_PER_RAD = 1000;

describe('bodyDrawRadiusM', () => {
  it('returns the bare radius for a body with no shells', () => {
    // Mimas: no ATMOSPHERE_PARAMS row, not Earth (cloud shell), not Saturn (ring).
    const mimas = findPlanet('mimas');
    expect(bodyDrawRadiusM(mimas, DIST_M, PX_PER_RAD)).toBe(outerBoundRadiusM(mimas.surface));
  });

  it("returns Saturn's ring outer edge", () => {
    const saturn = findPlanet('saturn');
    // Hand-computed from sceneRings.ts:36 — outerRadiusKm 140_220 → metres.
    const result = bodyDrawRadiusM(saturn, DIST_M, PX_PER_RAD);
    expect(result).toBe(140_220_000);
    expect(result).toBeGreaterThan(outerBoundRadiusM(saturn.surface));
  });

  it("returns Earth's atmosphere top, not its cloud shell — the cloud shell still comes from the envelope row", () => {
    // Derived from the same table bodyDrawRadiusM reads (atmosphereParams.ts),
    // not a restated literal — F2's relief moved Earth's inner bound off the
    // datum. Must beat the cloud shell (BODY_DRAW_ENVELOPES's 'earth' row,
    // footprint * radiusRatio) — a missing km->m conversion on the
    // atmosphere branch would make the cloud shell win instead, a 1000x
    // wrong near plane.
    const result = bodyDrawRadiusM(SCENE_EARTH, DIST_M, PX_PER_RAD);
    expect(result).toBe(ATMOSPHERE_PARAMS.earth!.atmosphereTopKm * SCALE_UNITS.KM_TO_M);
    const cloudShellM = outerBoundRadiusM(SCENE_EARTH.surface) * CLOUD_SHELL_PARAMS.radiusRatio;
    expect(result).toBeGreaterThan(cloudShellM);
  });
});
