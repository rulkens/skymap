/**
 * sceneOrbits — derivation tests for the debug orbit-ring table.
 *
 * The table is DERIVED from the body seeds, so every expectation here is
 * computed from the SAME seed constants the module imports (SCENE_EARTH /
 * SCENE_PLANETS / SCALE_UNITS / ECLIPTIC_BASIS) — never hardcoded decimals.
 * That keeps these tests green if a seed moves (e.g. the Moon's offset
 * direction), while still pinning the structural invariants:
 *
 *   - three orbits (earth, jupiter, moon), the Moon centred on Earth;
 *   - radii equal the seed separations (1 AU, 5.2 AU, 384,400 km in Mpc);
 *   - (uAxis, vAxis, ecliptic normal) is an orthonormal right-handed triple;
 *   - the body sits at local angle 0: center + uAxis·radius ≈ body position
 *     (the property the fragment shader's fixed brightness lobe relies on).
 */

import { describe, expect, it } from 'vitest';

import { SCENE_ORBITS } from '../../../src/data/bodies/sceneOrbits';
import { SCENE_EARTH, SCENE_PLANETS } from '../../../src/data/bodies/sceneBodies';
import { ECLIPTIC_BASIS } from '../../../src/data/bodies/eclipticBasis';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const MOON = SCENE_PLANETS.find((planet) => planet.id === 'moon')!;
const JUPITER = SCENE_PLANETS.find((planet) => planet.id === 'jupiter')!;

function dot(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a: Readonly<Vec3>): number {
  return Math.sqrt(dot(a, a));
}

function separation(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return length([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
}

function orbitOf(id: string) {
  const orbit = SCENE_ORBITS.find((o) => o.id === id);
  expect(orbit).toBeDefined();
  return orbit!;
}

describe('SCENE_ORBITS', () => {
  it('holds exactly the three derived orbits: earth, jupiter, moon', () => {
    expect(SCENE_ORBITS.map((orbit) => orbit.id)).toEqual(['earth', 'jupiter', 'moon']);
  });

  it('centres the heliocentric orbits on the origin and the Moon on Earth', () => {
    expect(orbitOf('earth').centerMpc).toEqual([0, 0, 0]);
    expect(orbitOf('jupiter').centerMpc).toEqual([0, 0, 0]);
    // The Moon's centre IS Earth's seeded position — derived, so exact.
    expect(orbitOf('moon').centerMpc).toEqual([...SCENE_EARTH.positionMpc]);
  });

  it('radii equal the seed separations (1 AU / 5.2 AU / 384,400 km in Mpc)', () => {
    // Expected radii computed from the same seed constants the module reads
    // — the physical values (1 AU etc.) are asserted through SCALE_UNITS so
    // the test documents them without re-typing catalogue decimals.
    const earthR = orbitOf('earth').radiusMpc;
    expect(earthR).toBeCloseTo(separation(SCENE_EARTH.positionMpc, [0, 0, 0]), 20);
    expect(earthR).toBeCloseTo(1 * SCALE_UNITS.AU_TO_MPC, 15);

    const jupiterR = orbitOf('jupiter').radiusMpc;
    expect(jupiterR).toBeCloseTo(separation(JUPITER.positionMpc, [0, 0, 0]), 20);
    expect(jupiterR).toBeCloseTo(5.2 * SCALE_UNITS.AU_TO_MPC, 15);

    const moonR = orbitOf('moon').radiusMpc;
    expect(moonR).toBeCloseTo(separation(MOON.positionMpc, SCENE_EARTH.positionMpc), 20);
    expect(moonR).toBeCloseTo(384400 * SCALE_UNITS.KM_TO_MPC, 18);
  });

  it('every orbit basis is orthonormal and in the ecliptic plane', () => {
    for (const orbit of SCENE_ORBITS) {
      // Unit length.
      expect(length(orbit.uAxis)).toBeCloseTo(1, 12);
      expect(length(orbit.vAxis)).toBeCloseTo(1, 12);
      // Mutually orthogonal.
      expect(dot(orbit.uAxis, orbit.vAxis)).toBeCloseTo(0, 12);
      // Both in-plane (perpendicular to the ecliptic normal).
      expect(dot(orbit.uAxis, ECLIPTIC_BASIS.normal)).toBeCloseTo(0, 12);
      expect(dot(orbit.vAxis, ECLIPTIC_BASIS.normal)).toBeCloseTo(0, 12);
    }
  });

  it('places the body at local angle 0: center + uAxis·radius ≈ body position', () => {
    // The property the fragment shader's fixed angle-0 brightness lobe
    // relies on — uAxis is AIMED at the body by construction. Tolerance is
    // relative to the orbit radius (the seeds sit in/near the ecliptic, so
    // the projection step barely moves uAxis).
    const cases: ReadonlyArray<[string, Readonly<Vec3>]> = [
      ['earth', SCENE_EARTH.positionMpc],
      ['jupiter', JUPITER.positionMpc],
      ['moon', MOON.positionMpc],
    ];
    for (const [id, bodyPos] of cases) {
      const orbit = orbitOf(id);
      const reconstructed: Vec3 = [
        orbit.centerMpc[0] + orbit.uAxis[0] * orbit.radiusMpc,
        orbit.centerMpc[1] + orbit.uAxis[1] * orbit.radiusMpc,
        orbit.centerMpc[2] + orbit.uAxis[2] * orbit.radiusMpc,
      ];
      const errorMpc = separation(reconstructed, bodyPos);
      expect(errorMpc).toBeLessThan(orbit.radiusMpc * 1e-6);
    }
  });

  it('carries dim linear-RGB tints suited to the additive HDR draw', () => {
    for (const orbit of SCENE_ORBITS) {
      expect(orbit.color).toHaveLength(3);
      for (const channel of orbit.color) {
        expect(channel).toBeGreaterThan(0);
        // Additive-HDR guidance affordance — keep the max channel dim.
        expect(channel).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
