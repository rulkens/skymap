import { describe, it, expect } from 'vitest';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { rotationFromIau } from '../../../src/utils/orbit/rotationFromIau';
import { rotationRowById } from '../../../src/data/bodies/rotationElements';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';

const hypot3 = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

// Position + orientation live in each body's derived BodyState, not the record.
const states = deriveBodyStates(CONST_J2000);
const stateOf = (id: string) => states.get(id)!;

describe('SCENE_PLANETS', () => {
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
    const saturnRow = rotationRowById('saturn')!;
    if (!('poleRaDeg' in saturnRow)) throw new Error('saturn must be an IAU-pole row');
    expect(stateOf('saturn').orientation).toEqual(rotationFromIau(saturnRow));
    expect(stateOf('phobos').orientation).toEqual([...IDENTITY_MAT3]);
  });
});
