import { describe, expect, it } from 'vitest';
import structureSeedJson from '../../../../data/seeds/structure_anchors.seed.json';
import { EXOPLANET_ORBITS } from '../../../../src/layers/structure/data/exoplanetOrbits';
import { exoplanetSystemExtentAu } from '../../../../src/layers/structure/present/exoplanetSystemExtentAu';

// Focus frames a structure on its seed radii, so a host whose radius drifts from
// its orbit diagram flies the camera to the wrong scale: TRAPPIST-1 once framed
// 10,000 au of empty space around a 0.06 au system.
const hosts = structureSeedJson.filter((row) => row.category === 'exoplanet-system');

describe('EXOPLANET_ORBITS', () => {
  it('covers exactly the exoplanet-system seed rows', () => {
    expect(hosts.map((row) => `exoplanet-system-${row.id}`).sort()).toEqual(
      Object.keys(EXOPLANET_ORBITS).sort(),
    );
  });

  it.each(hosts.map((row) => [row.id, row] as const))(
    "%s's seed radii are its diagram extent and 3x that",
    (id, row) => {
      const extentAu = exoplanetSystemExtentAu(EXOPLANET_ORBITS[`exoplanet-system-${id}`]!);
      expect(row.physicalRadius).toEqual({ value: extentAu, unit: 'au' });
      expect(row.apparentRadius.unit).toBe('au');
      expect(row.apparentRadius.value / extentAu).toBeCloseTo(3, 4);
    },
  );
});
