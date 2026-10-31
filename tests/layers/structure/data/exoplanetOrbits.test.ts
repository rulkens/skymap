import { describe, expect, it } from 'vitest';
import structureSeedJson from '../../../../data/seeds/structure_anchors.seed.json';
import { EXOPLANET_ORBITS } from '../../../../src/layers/structure/data/exoplanetOrbits';
import { exoplanetSystemExtentAu } from '../../../../src/layers/structure/present/exoplanetSystemExtentAu';
import { EXOPLANET_PLANETS } from '../../../../src/layers/body/bodies/exoplanetPlanets';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { buildStaticAnchorStructures } from '../../../../src/layers/structure/load/buildStaticAnchorStructures';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

// Focus frames a structure on its seed radii, so a host whose radius drifts from
// its orbits flies the camera to the wrong scale: TRAPPIST-1 once framed
// 10,000 au of empty space around a 0.06 au system.
const hosts = structureSeedJson.filter((row) => row.category === 'exoplanet-system');
const planetOrbits = EXOPLANET_PLANETS.flatMap((row) =>
  row.position.kind === 'orbit' ? [row.position.elements] : [],
);

/** The au radius of a host's drawn orbits: its diagram, or its scene planets' widest orbit. */
function drawnExtentAu(id: string): number {
  const diagram = EXOPLANET_ORBITS[`exoplanet-system-${id}`];
  if (diagram !== undefined) return exoplanetSystemExtentAu(diagram);
  const orbits = planetOrbits.filter((el) => el.focusId === id);
  return Math.max(...orbits.map((el) => el.semiMajorMpc)) / SCALE_UNITS.AU_TO_MPC;
}

describe('EXOPLANET_ORBITS', () => {
  it('draws every exoplanet-system host exactly once: a diagram or scene planets', () => {
    for (const { id } of hosts) {
      const hasDiagram = `exoplanet-system-${id}` in EXOPLANET_ORBITS;
      const hasPlanets = planetOrbits.some((el) => el.focusId === id);
      expect(hasDiagram !== hasPlanets, id).toBe(true);
    }
  });

  // Both are built from RA/Dec; a 0.00001° rounding apart is 0.45 au at TRAPPIST-1,
  // seven times the system, and the focus frames empty sky beside it.
  it('puts a body-backed host on its star, to within 1% of the system', () => {
    const anchors = buildStaticAnchorStructures();
    const states = deriveBodyStates(CONST_J2000);
    for (const { id } of hosts.filter((row) => !(`exoplanet-system-${row.id}` in EXOPLANET_ORBITS))) {
      const anchor = anchors.find((s) => s.id === `exoplanet-system-${id}`)!.worldPos;
      const star = states.get(asSceneBodyId(id))!.positionMpc;
      const apartMpc = Math.hypot(anchor[0] - star[0], anchor[1] - star[1], anchor[2] - star[2]);
      expect(apartMpc / (drawnExtentAu(id) * SCALE_UNITS.AU_TO_MPC), id).toBeLessThan(0.01);
    }
  });

  it.each(hosts.map((row) => [row.id, row] as const))(
    "%s's seed radii are its drawn extent and 3x that",
    (id, row) => {
      const extentAu = drawnExtentAu(id);
      expect(row.physicalRadius.unit).toBe('au');
      expect(row.physicalRadius.value / extentAu).toBeCloseTo(1, 9);
      expect(row.apparentRadius.unit).toBe('au');
      expect(row.apparentRadius.value / extentAu).toBeCloseTo(3, 4);
    },
  );
});
