import { describe, it, expect } from 'vitest';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { rotationFromIau } from '../../../src/utils/orbit/rotationFromIau';
import { rotationById } from '../../../src/data/bodies/rotationElements';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';

const findPlanet = (id: string) => {
  const planet = SCENE_PLANETS.find((p) => p.id === id);
  if (!planet) throw new Error(`missing seeded planet: ${id}`);
  return planet;
};

const hypot3 = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

// Position + orientation live in each body's derived BodyState, not the record.
const states = deriveBodyStates(CONST_J2000);
const stateOf = (id: string) => states.get(id)!;

describe('SCENE_PLANETS', () => {
  it('radii', () => {
    expect(findPlanet('moon').radiusM).toBe(1737000);
    expect(findPlanet('jupiter').radiusM).toBe(69911000);
  });

  it('carries identity-only records (no baked position or orientation)', () => {
    for (const planet of SCENE_PLANETS) {
      expect('positionMpc' in planet).toBe(false);
      expect('orientation' in planet).toBe(false);
    }
  });

  it("Jupiter's heliocentric distance is Jovian-scale (~5.2 AU)", () => {
    // Jupiter's position is DERIVED from ORBITAL_ELEMENTS, so its radius is
    // a(1 − e·cosE) at the J2000 mean anomaly — NOT exactly 5.2 AU. Pinning the
    // derived digits would just restate the table one indirection out, so this
    // is a STRUCTURAL band: the distance must land within a(1±e) ≈ 4.95–5.45 AU
    // of the Sun. A misapplied unit or a dropped orbital element leaves this
    // band; a legitimate phase does not.
    const distAu = hypot3(stateOf('jupiter').positionMpc) / SCALE_UNITS.AU_TO_MPC;
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
    const moonPos = stateOf('moon').positionMpc;
    const earthPos = stateOf('earth').positionMpc;
    const offset: readonly [number, number, number] = [
      moonPos[0] - earthPos[0],
      moonPos[1] - earthPos[1],
      moonPos[2] - earthPos[2],
    ];

    const distKm = hypot3(offset) / SCALE_UNITS.KM_TO_MPC;
    expect(distKm).toBeGreaterThan(350_000);
    expect(distKm).toBeLessThan(420_000);
  });

  it('bake IAU orientation for textured bodies', () => {
    // Pins that the derive wired the registry-keyed choice, NOT a formula mirror:
    // the expectation is built from the authored ROTATION_ELEMENTS table through
    // the same util the derive calls, so this exercises the WIRING (does Saturn's
    // orientation come from its rotation elements?) rather than restating a
    // matrix. A textured body carries its baked IAU rotation; an irregular moon
    // with no registry row (Phobos) carries the identity, the honest "no facing
    // modelled" value.
    expect(stateOf('saturn').orientation).toEqual(rotationFromIau(rotationById('saturn')));
    expect(stateOf('phobos').orientation).toEqual([...IDENTITY_MAT3]);
  });
});
