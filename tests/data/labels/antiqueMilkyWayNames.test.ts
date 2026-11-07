import { describe, it, expect } from 'vitest';
import { ANTIQUE_MILKY_WAY_NAMES } from '../../../src/data/labels/antiqueMilkyWayNames';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../src/data/milkyWay/milkyWayGalaxyParams';
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../src/data/milkyWay/galacticCenter';
import { describeGalaxy } from '../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { armRidgeAngle } from '../../../src/services/engine/galaxyGenerator/v2/armRidgeGeometry';

const R0_KPC = 8.178;
const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
const unitsPerKpc = geometry.outerRadius / MILKY_WAY_DISC_RADIUS_KPC;

/** Radii (kpc) where a generated arm crosses the Sun's side of the Sun–centre line (azimuth π). */
function sunLineCrossings(arm: number): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (let kpc = 2; kpc <= 20; kpc += 0.02) {
    const angle = armRidgeAngle(
      Math.log((kpc * unitsPerKpc) / geometry.armStartRadius),
      geometry,
      geometry.arms[arm]!,
    );
    const off = Math.sin(angle - Math.PI); // changes sign through azimuth π (and 0)
    if (prev !== null && Math.sign(off) !== Math.sign(prev) && Math.cos(angle) < 0) out.push(kpc);
    prev = off;
  }
  return out;
}

const armOf = (id: string) => {
  const at = ANTIQUE_MILKY_WAY_NAMES.find((n) => n.id === id)!.at;
  return 'arm' in at ? at.arm : -1;
};
const firstCrossingAfter = (id: string, kpc: number) =>
  sunLineCrossings(armOf(id)).find((r) => r > kpc) ?? Infinity;

// A reseed or a preset change reorders the generated arms; these names would then sit on
// the wrong arm with nothing else noticing.
describe('ANTIQUE_MILKY_WAY_NAMES', () => {
  it('names the arm just inside the Sun Sagittarius and the one just outside Perseus', () => {
    const inside = sunLineCrossings(armOf('mwName-sagittarius')).filter((r) => r < R0_KPC);
    expect(Math.max(...inside)).toBeGreaterThan(5.5);
    expect(firstCrossingAfter('mwName-perseus', R0_KPC)).toBeLessThan(12);
  });

  it('names Scutum the arm inside Sagittarius, and Norma–Outer the one beyond Perseus', () => {
    const scutum = sunLineCrossings(armOf('mwName-scutum')).filter((r) => r < R0_KPC);
    expect(Math.max(...scutum)).toBeLessThan(5.5);
    expect(firstCrossingAfter('mwName-outer', R0_KPC)).toBeGreaterThan(
      firstCrossingAfter('mwName-perseus', R0_KPC),
    );
    expect(armOf('mwName-norma')).toBe(armOf('mwName-outer'));
  });
});
