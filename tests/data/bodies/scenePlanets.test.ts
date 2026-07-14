import { describe, it, expect } from 'vitest';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

const findPlanet = (id: string) => {
  const planet = SCENE_PLANETS.find((p) => p.id === id);
  if (!planet) throw new Error(`missing seeded planet: ${id}`);
  return planet;
};

const hypot3 = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

describe('SCENE_PLANETS', () => {
  it('radii', () => {
    expect(findPlanet('moon').radiusKm).toBe(1737);
    expect(findPlanet('jupiter').radiusKm).toBe(69911);
  });

  it("Jupiter's heliocentric distance is Jovian-scale (~5.2 AU)", () => {
    // Jupiter's position is DERIVED from ORBITAL_ELEMENTS, so its radius is
    // a(1 − e·cosE) at the J2000 mean anomaly — NOT exactly 5.2 AU. Pinning the
    // derived digits would just restate the table one indirection out, so this
    // is a STRUCTURAL band: the distance must land within a(1±e) ≈ 4.95–5.45 AU
    // of the Sun. A misapplied unit or a dropped orbital element leaves this
    // band; a legitimate phase does not.
    const jupiter = findPlanet('jupiter');
    const distAu = hypot3(jupiter.positionMpc) / SCALE_UNITS.AU_TO_MPC;
    expect(distAu).toBeGreaterThan(4.9);
    expect(distAu).toBeLessThan(5.5);
  });

  it('derives the Moon relative to Earth at a lunar-scale distance', () => {
    // The Moon is geocentric: its focus is Earth's OWN derived position, so
    // |Moon − Earth| — not |Moon − Sun| — is the meaningful quantity. This
    // proves the parent-relative derivation (a bug adding the render origin
    // instead of Earth would leave |Moon − Earth| at ~1 AU, not ~384,400 km).
    // Structural band a(1±e) ≈ 363,000–406,000 km, not a value pin: the derived
    // separation is a(1 − e·cosE) at the Moon's J2000 mean anomaly.
    const moon = findPlanet('moon');
    const earthPos = SCENE_EARTH.positionMpc;
    const offset: readonly [number, number, number] = [
      (moon.positionMpc[0] as number) - (earthPos[0] as number),
      (moon.positionMpc[1] as number) - (earthPos[1] as number),
      (moon.positionMpc[2] as number) - (earthPos[2] as number),
    ];

    const distKm = hypot3(offset) / SCALE_UNITS.KM_TO_MPC;
    expect(distKm).toBeGreaterThan(350_000);
    expect(distKm).toBeLessThan(420_000);
  });
});
