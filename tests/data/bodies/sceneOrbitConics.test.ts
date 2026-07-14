/**
 * sceneOrbitConics — structural tests for the absolute-world orbit ellipse table.
 *
 * The table is DERIVED from `ORBITAL_ELEMENTS` + `keplerianEllipse` + parent
 * resolution, so these tests pin INVARIANTS of that derivation, not re-typed
 * decimals:
 *
 *   - body-on-trail: each body's world position (seeded independently via
 *     `keplerianPositionMpc`) lands on its own ellipse. We recover the point's
 *     plane coords in the `(A, B)` basis and assert `s² + t² ≈ 1` — the unit
 *     circle the affine map images. This is an INDEPENDENT check: the body
 *     position and the ellipse basis flow through two different functions from
 *     the one element table, and agreement is the property (not a formula
 *     mirror — nothing here recomputes `keplerianPositionMpc`).
 *   - parent resolution: the Moon's ellipse centre resolves to EARTH, not the
 *     Sun — its centre sits within the lunar `a·e` offset of Earth's position,
 *     orders of magnitude nearer than the ~1 AU Earth–Sun separation a Sun
 *     focus would give.
 */

import { describe, expect, it } from 'vitest';

import { SCENE_ORBIT_CONICS } from '../../../src/data/bodies/sceneOrbitConics';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { ORBITAL_ELEMENTS } from '../../../src/data/bodies/orbitalElements';
import { RENDER_ORIGIN_MPC } from '../../../src/data/renderOrigin';
import type { Vec3 } from '../../../src/@types/math/Vec3';

function dot(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a: Readonly<Vec3>): number {
  return Math.sqrt(dot(a, a));
}

function sub(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function bodyPositionOf(id: string): Readonly<Vec3> {
  const body = SCENE_BODIES.find((b) => b.id === id);
  expect(body, `SCENE_BODIES has a '${id}' entry`).toBeDefined();
  return body!.positionMpc;
}

describe('SCENE_ORBIT_CONICS', () => {
  it('places each body on its own ellipse (s² + t² ≈ 1 in the A,B basis)', () => {
    // A ⟂ B, so X_body = C + s·A + t·B solves to a projection onto each axis:
    //   s = (X_body − C)·A / |A|²,  t = (X_body − C)·B / |B|².
    // The body position comes from the seed (keplerianPositionMpc); the basis
    // from keplerianEllipse. If the two agree the point is on the unit circle.
    for (const conic of SCENE_ORBIT_CONICS) {
      const rel = sub(bodyPositionOf(conic.id), conic.centerMpc);
      const a2 = dot(conic.semiMajorMpc, conic.semiMajorMpc);
      const b2 = dot(conic.semiMinorMpc, conic.semiMinorMpc);
      const s = dot(rel, conic.semiMajorMpc) / a2;
      const t = dot(rel, conic.semiMinorMpc) / b2;
      expect(s * s + t * t, `${conic.id} on its ellipse`).toBeCloseTo(1, 6);
    }
  });

  it("resolves the Moon's centre to Earth (within the lunar a·e offset)", () => {
    const moonConic = SCENE_ORBIT_CONICS.find((c) => c.id === 'moon');
    expect(moonConic).toBeDefined();
    const moonEl = ORBITAL_ELEMENTS.find((e) => e.id === 'moon')!;

    // The ellipse centre is offset from its focus by |C − focus| = a·e. If the
    // focus resolved to Earth, the centre sits that tiny distance from Earth;
    // if it had (wrongly) resolved to the Sun, it would be ~1 AU away.
    const aE = moonEl.semiMajorMpc * moonEl.eccentricity;
    const distToEarth = length(sub(moonConic!.centerMpc, SCENE_EARTH.positionMpc));
    const earthSunDist = length(sub(SCENE_EARTH.positionMpc, RENDER_ORIGIN_MPC));

    expect(distToEarth).toBeCloseTo(aE, 20); // centre offset is exactly a·e
    expect(distToEarth).toBeLessThan(earthSunDist * 1e-3); // Earth, not the Sun
  });
});
