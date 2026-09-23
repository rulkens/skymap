import { describe, it, expect } from 'vitest';
import { bodyDrawRadiusM } from '../../../src/utils/scene/bodyDrawRadiusM';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { ATMOSPHERE_PARAMS } from '../../../src/data/bodies/atmosphereParams';
import { CLOUD_SHELL_PARAMS } from '../../../src/data/bodies/cloudShellParams';
import { SGR_A_STAR } from '../../../src/data/bodies/sceneSgrAStar';
import { sgrAStarLensEnvelopeM } from '../../../src/data/bodies/sgrAStarLensEnvelope';
import { SCALE_FADE_BANDS } from '../../../src/services/engine/presentation/scaleFadeBands';
import { outerBoundRadiusM } from '../../../src/utils/occlusion/outerBoundRadiusM';
import { schwarzschildRadiusM } from '../../../src/utils/physics/schwarzschildRadiusM';
import { SGR_A_STAR_MASS_SOLAR } from '../../../src/data/bodies/sgrAStarMassSolar';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

const findPlanet = (id: string) => {
  const body = SCENE_PLANETS.find((row) => row.id === id);
  if (body === undefined) throw new Error(`test fixture: no seeded body '${id}'`);
  return body;
};

// distM/pxPerRad are unread by every fixture below except Sgr A*'s — a fixed
// stand-in keeps those cases from restating the envelope math they don't
// exercise.
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

  it('returns the lens envelope radius for Sgr A* inside the lens band, the bare r_s outside it', () => {
    const rS = schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR);
    const insideBandM = (SCALE_FADE_BANDS.sgrAStarLensing.goneAt / 2) * SCALE_UNITS.MPC_TO_M;
    const outsideBandM = SCALE_FADE_BANDS.sgrAStarLensing.goneAt * 2 * SCALE_UNITS.MPC_TO_M;

    const inside = bodyDrawRadiusM(SGR_A_STAR, insideBandM, PX_PER_RAD);
    expect(inside).toBe(sgrAStarLensEnvelopeM(insideBandM, PX_PER_RAD));
    expect(inside).toBeGreaterThan(rS);

    const outside = bodyDrawRadiusM(SGR_A_STAR, outsideBandM, PX_PER_RAD);
    expect(outside).toBe(outerBoundRadiusM(SGR_A_STAR.surface));
  });
});
