import { describe, it, expect } from 'vitest';
import {
  SCENE_EARTH,
  SCENE_STARS,
  SCENE_PLANETS,
  SCENE_BODIES,
} from '../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { raDecDistToCartesian } from '../../../src/utils/math/raDecDistToCartesian';

const findStar = (id: string) => {
  const star = SCENE_STARS.find((s) => s.id === id);
  if (!star) throw new Error(`missing seeded star: ${id}`);
  return star;
};

const findPlanet = (id: string) => {
  const planet = SCENE_PLANETS.find((p) => p.id === id);
  if (!planet) throw new Error(`missing seeded planet: ${id}`);
  return planet;
};

const hypot3 = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

describe('SCENE_EARTH', () => {
  it('radius is 6371 km', () => {
    expect(SCENE_EARTH.radiusKm).toBe(6371);
  });

  it('sits ~1 AU from the Sun (derived J2000 heliocentric position)', () => {
    // Earth's position is now DERIVED from ORBITAL_ELEMENTS, not pinned to the
    // old [1 AU, 0, 0] literal (which would just restate the table). Pinning
    // the exact derived xyz would be the same restatement one indirection out,
    // so this is a STRUCTURAL band: Earth's heliocentric distance stays within
    // a(1±e) ≈ 0.983–1.017 AU of the Sun — order-of-magnitude proof, not a
    // value pin. The frame/direction is exercised by the star-direction test.
    const distAu = hypot3(SCENE_EARTH.positionMpc) / SCALE_UNITS.AU_TO_MPC;
    expect(distAu).toBeGreaterThan(0.97);
    expect(distAu).toBeLessThan(1.03);
  });

  it('textureUrl points at the Blue Marble asset', () => {
    expect(SCENE_EARTH.textureUrl).toBe('/images/earth/blue-marble-4k.jpg');
  });
});

describe('SCENE_STARS', () => {
  it('contains the Sun at the origin', () => {
    const sun = findStar('sun');
    // distPc = 0 collapses raDecDistToCartesian to the render origin regardless
    // of the authored RA/Dec — the Sun is the frame's centre.
    expect(sun.positionMpc[0]).toBeCloseTo(0, 30);
    expect(sun.positionMpc[1]).toBeCloseTo(0, 30);
    expect(sun.positionMpc[2]).toBeCloseTo(0, 30);
    expect(sun.radiusKm).toBe(696340);
  });

  it('Proxima sits ~1.301 pc from the Sun', () => {
    // The parsec-scale f64 anchor: this magnitude is what the descent pins its
    // precision against, so the tolerance is tight.
    const proxima = findStar('proxima-centauri');
    const expected = 1.301 * SCALE_UNITS.PC_TO_MPC;
    const tolMpc = 1e-3 * SCALE_UNITS.PC_TO_MPC;
    expect(Math.abs(hypot3(proxima.positionMpc) - expected)).toBeLessThan(tolMpc);
  });

  it('the local map covers the neighbourhood', () => {
    expect(SCENE_STARS.length).toBeGreaterThanOrEqual(20);
    for (const star of SCENE_STARS) {
      expect(Number.isFinite(star.positionMpc[0])).toBe(true);
      expect(Number.isFinite(star.positionMpc[1])).toBe(true);
      expect(Number.isFinite(star.positionMpc[2])).toBe(true);
      expect(Number.isFinite(star.absMag)).toBe(true);
      for (const c of star.color) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('named stars sit at their catalogued distances', () => {
    // Spot checks against published nearest-/brightest-star distances. Loose
    // tolerance (~0.02 pc) because A/B components are merged onto the primary.
    const tol = 0.02 * SCALE_UNITS.PC_TO_MPC;

    const alphaCen = findStar('alpha-centauri');
    expect(Math.abs(hypot3(alphaCen.positionMpc) - 1.34 * SCALE_UNITS.PC_TO_MPC)).toBeLessThan(tol);

    const sirius = findStar('sirius');
    expect(Math.abs(hypot3(sirius.positionMpc) - 2.64 * SCALE_UNITS.PC_TO_MPC)).toBeLessThan(tol);
  });

  it('star direction matches its RA/Dec through the shared conversion', () => {
    // Authored here independently of the seed (NOT imported from it) so the
    // assertion pins the FRAME: a rotated or bare-xyz seed fails here even
    // though it would pass the pure-magnitude checks above. Digit-9 tolerance
    // (0.5e-9 Mpc ~ 100 AU) allows the seed to carry one more decimal of
    // RA/Dec precision than these constants while any axis swap, sign flip,
    // or rotation still misses by ~1e-6 Mpc — six orders of magnitude out.
    const siriusRaDeg = 101.287;
    const siriusDecDeg = -16.716;
    const siriusDistPc = 2.64;
    const expected = raDecDistToCartesian(
      siriusRaDeg,
      siriusDecDeg,
      siriusDistPc * SCALE_UNITS.PC_TO_MPC,
    );

    const sirius = findStar('sirius');
    expect(sirius.positionMpc[0]).toBeCloseTo(expected[0], 9);
    expect(sirius.positionMpc[1]).toBeCloseTo(expected[1], 9);
    expect(sirius.positionMpc[2]).toBeCloseTo(expected[2], 9);
  });
});

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

describe('SCENE_BODIES registry', () => {
  it('includes Earth, the seeded stars, and the seeded planets', () => {
    const ids = new Set(SCENE_BODIES.map((b) => b.id));
    expect(ids.has('earth')).toBe(true);
    expect(ids.has('sun')).toBe(true);
    expect(ids.has('sirius')).toBe(true);
    expect(ids.has('moon')).toBe(true);
    expect(ids.has('jupiter')).toBe(true);
  });
});
