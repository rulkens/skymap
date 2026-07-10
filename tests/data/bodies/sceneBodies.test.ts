import { describe, it, expect } from 'vitest';
import {
  SCENE_EARTH,
  SCENE_STARS,
  SCENE_PLANETS,
  SCENE_BODIES,
} from '../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { ECLIPTIC_BASIS } from '../../../src/data/bodies/eclipticBasis';
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

  it('is one AU from the Sun in Mpc', () => {
    // Position is authored in human units (1 AU) and stored as canonical Mpc.
    expect(SCENE_EARTH.positionMpc[0] as number).toBeCloseTo(SCALE_UNITS.AU_TO_MPC, 30);
    expect(SCENE_EARTH.positionMpc[1] as number).toBe(0);
    expect(SCENE_EARTH.positionMpc[2] as number).toBe(0);
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

  it('planet positions are authored via SCALE_UNITS', () => {
    // Assert the SCALE_UNITS relation (~5.2 AU), not a bare Mpc number.
    // Digit 20 (0.5e-20 Mpc) sits far below any authored offset yet above
    // Math.hypot's ~1 ulp (~5e-26 at this magnitude) rounding noise.
    const jupiter = findPlanet('jupiter');
    expect(hypot3(jupiter.positionMpc)).toBeCloseTo(5.2 * SCALE_UNITS.AU_TO_MPC, 20);
  });

  it('the Moon is offset from Earth along the ecliptic, not frame +y', () => {
    // Regression guard for the equatorial/ecliptic mixup: a bare frame-+y
    // offset would sit 23.4° out of the ecliptic, where the real Moon never
    // strays more than ~5°. The offset from Earth must be parallel to
    // ECLIPTIC_BASIS.yAxis and exactly 384,400 km long in Mpc.
    const moon = findPlanet('moon');
    const earthPos = SCENE_EARTH.positionMpc;
    const offset: readonly [number, number, number] = [
      (moon.positionMpc[0] as number) - (earthPos[0] as number),
      (moon.positionMpc[1] as number) - (earthPos[1] as number),
      (moon.positionMpc[2] as number) - (earthPos[2] as number),
    ];

    const expectedLenMpc = 384400 * SCALE_UNITS.KM_TO_MPC;
    expect(hypot3(offset)).toBeCloseTo(expectedLenMpc, 20);

    // Parallel to ECLIPTIC_BASIS.yAxis: offset normalized equals yAxis
    // (both unit-length, same direction) within floating-point tolerance.
    const len = hypot3(offset);
    expect(offset[0] / len).toBeCloseTo(ECLIPTIC_BASIS.yAxis[0], 12);
    expect(offset[1] / len).toBeCloseTo(ECLIPTIC_BASIS.yAxis[1], 12);
    expect(offset[2] / len).toBeCloseTo(ECLIPTIC_BASIS.yAxis[2], 12);
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
