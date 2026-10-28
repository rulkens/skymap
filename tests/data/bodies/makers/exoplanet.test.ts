import { describe, expect, it } from 'vitest';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { EXOPLANET_PLANETS } from '../../../../src/data/bodies/exoplanetPlanets';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { planeFrameFromPole } from '../../../../src/data/bodies/orbitPlaneFrames';

const AU = SCALE_UNITS.AU_TO_MPC;
const E = EXOPLANET_PLANETS.find((p) => p.elements.id === 'trappist-1-e')!.elements;
const E_TRANSIT_JD = 2457660.3676621; // pl_tranmid, the seed's epoch
const E_PERIOD_DAYS = 6.101013;
const STAR = asSceneBodyId('trappist-1');

const at = (jd: number) => {
  const states = deriveBodyStates(jd);
  return { planet: states.get(E.id)!.positionMpc, star: states.get(STAR)!.positionMpc };
};

describe('exoplanet', () => {
  it('puts the planet between its star and the Sun at a transit midpoint', () => {
    // Ten orbits on, so the mean motion is checked as well as the epoch.
    const { planet, star } = at(E_TRANSIT_JD + 10 * E_PERIOD_DAYS);
    const nearerBy = Math.hypot(...star) - Math.hypot(...planet);
    expect(nearerBy / E.semiMajorMpc).toBeCloseTo(Math.sin((89.793 * Math.PI) / 180), 3);
  });

  // The node's position angle is a convention (0, north): an edge-on orbit then
  // crosses our sky north–south, and a quarter turn after transit the planet is on it.
  it('puts the line of nodes north–south on our sky', () => {
    const { planet, star } = at(E_TRANSIT_JD + E_PERIOD_DAYS / 4);
    const north = planeFrameFromPole(346.62639, -5.04346).yAxis;
    const offset = [planet[0] - star[0], planet[1] - star[1], planet[2] - star[2]];
    const along = (offset[0]! * north[0] + offset[1]! * north[1] + offset[2]! * north[2]) / Math.hypot(...offset);
    expect(Math.abs(along)).toBeGreaterThan(0.99);
  });

  it('keeps the orbit at the published semi-major axis', () => {
    for (const jd of [E_TRANSIT_JD, E_TRANSIT_JD + 1.7]) {
      const { planet, star } = at(jd);
      const r = Math.hypot(planet[0] - star[0], planet[1] - star[1], planet[2] - star[2]);
      expect(Math.abs(r / AU - 0.02925)).toBeLessThan(0.0051 * 0.02925 + 1e-9);
    }
  });
});
