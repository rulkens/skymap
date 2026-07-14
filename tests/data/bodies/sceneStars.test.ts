import { describe, it, expect } from 'vitest';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { raDecDistToCartesian } from '../../../src/utils/math/raDecDistToCartesian';

const findStar = (id: string) => {
  const star = SCENE_STARS.find((s) => s.id === id);
  if (!star) throw new Error(`missing seeded star: ${id}`);
  return star;
};

const hypot3 = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

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
