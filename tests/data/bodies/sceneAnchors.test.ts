import { describe, it, expect } from 'vitest';
import { SCENE_ANCHORS } from '../../../src/data/bodies/sceneAnchors';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { raDecDistToCartesian } from '../../../src/utils/math/raDecDistToCartesian';

const findAnchor = (id: string) => {
  const anchor = SCENE_ANCHORS.find((a) => a.id === id);
  if (!anchor) throw new Error(`missing anchor: ${id}`);
  return anchor;
};

const hypot3 = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

describe('SCENE_ANCHORS', () => {
  it('the Sun anchor is heliocentric zero', () => {
    expect(findAnchor('sun').positionMpc).toEqual([0, 0, 0]);
  });

  it('every famous star seed has a matching anchor', () => {
    // Totality: a seed with no anchor has no snapshot entry, so
    // `positionedVisibleStars`' lookup would miss and the star would draw at
    // whatever a fallback chose — the origin, on top of the Sun. This is what
    // makes that lookup's non-null assertion safe.
    const anchorIds = new Set(SCENE_ANCHORS.map((anchor) => anchor.id));
    for (const star of SCENE_STARS) {
      expect(anchorIds.has(star.id), `anchor for '${star.id}'`).toBe(true);
    }
  });

  it('Proxima sits ~1.301 pc from the Sun', () => {
    // The parsec-scale f64 anchor: this magnitude is what the descent pins its
    // precision against, so the tolerance is tight.
    const proxima = findAnchor('proxima-centauri');
    const expected = 1.301 * SCALE_UNITS.PC_TO_MPC;
    const tolMpc = 1e-3 * SCALE_UNITS.PC_TO_MPC;
    expect(Math.abs(hypot3(proxima.positionMpc) - expected)).toBeLessThan(tolMpc);
  });

  it('named stars sit at their catalogued distances', () => {
    // Spot checks against published nearest-/brightest-star distances. Loose
    // tolerance (~0.02 pc) because A/B components are merged onto the primary.
    const tol = 0.02 * SCALE_UNITS.PC_TO_MPC;

    const alphaCen = findAnchor('alpha-centauri');
    expect(Math.abs(hypot3(alphaCen.positionMpc) - 1.34 * SCALE_UNITS.PC_TO_MPC)).toBeLessThan(tol);

    const sirius = findAnchor('sirius');
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

    const sirius = findAnchor('sirius');
    expect(sirius.positionMpc[0]).toBeCloseTo(expected[0], 9);
    expect(sirius.positionMpc[1]).toBeCloseTo(expected[1], 9);
    expect(sirius.positionMpc[2]).toBeCloseTo(expected[2], 9);
  });

  it('every anchor position is finite', () => {
    for (const anchor of SCENE_ANCHORS) {
      for (const c of anchor.positionMpc) {
        expect(Number.isFinite(c), anchor.id).toBe(true);
      }
    }
  });
});
