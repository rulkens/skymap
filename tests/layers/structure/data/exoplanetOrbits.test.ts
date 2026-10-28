import { describe, expect, it } from 'vitest';
import structureSeedJson from '../../../../data/seeds/structure_anchors.seed.json';
import { EXOPLANET_ORBITS } from '../../../../src/layers/structure/data/exoplanetOrbits';
import { exoplanetSystemExtentAu } from '../../../../src/layers/structure/present/exoplanetSystemExtentAu';
import { EXOPLANET_PLANETS } from '../../../../src/data/bodies/exoplanetPlanets';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

// Focus frames a structure on its seed radii, so a host whose radius drifts from
// its orbits flies the camera to the wrong scale: TRAPPIST-1 once framed
// 10,000 au of empty space around a 0.06 au system.
const hosts = structureSeedJson.filter((row) => row.category === 'exoplanet-system');

/** The au radius of a host's drawn orbits: its diagram, or its scene planets' widest orbit. */
function drawnExtentAu(id: string): number {
  const diagram = EXOPLANET_ORBITS[`exoplanet-system-${id}`];
  if (diagram !== undefined) return exoplanetSystemExtentAu(diagram);
  const orbits = EXOPLANET_PLANETS.filter((p) => p.elements.focusId === id);
  return Math.max(...orbits.map((p) => p.elements.semiMajorMpc)) / SCALE_UNITS.AU_TO_MPC;
}

describe('EXOPLANET_ORBITS', () => {
  it('draws every exoplanet-system host exactly once: a diagram or scene planets', () => {
    for (const { id } of hosts) {
      const hasDiagram = `exoplanet-system-${id}` in EXOPLANET_ORBITS;
      const hasPlanets = EXOPLANET_PLANETS.some((p) => p.elements.focusId === id);
      expect(hasDiagram !== hasPlanets, id).toBe(true);
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
