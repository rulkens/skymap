/**
 * uniformInSphere — draw a point distributed uniformly inside the unit
 * ball (radius 1, centred at the origin), using rejection sampling
 * driven by a caller-supplied `[0, 1)` random source.
 *
 * ### Why rejection sampling?
 *
 * A beginner's first instinct is to draw a random direction on the unit
 * sphere and scale it by a random radius:
 *
 *     r = rand()^(1/3)            // density ∝ r² cancels the volume element
 *     point = unitVector * r
 *
 * That formula *does* give uniform-in-sphere points but requires a
 * cube-root and a unit-vector normalisation (which itself needs a square
 * root and a divide-by-zero guard).  An even simpler mistake is
 * `rand()` directly as the radius — that over-populates the centre,
 * because a thin shell's volume grows as r², so the PDF of r alone
 * should be ∝ r², not uniform.
 *
 * Rejection sampling avoids both problems with only arithmetic:
 *
 *  1. Draw (x, y, z) uniformly in the cube [−1, +1]³.
 *  2. If the point lands outside the unit sphere (x²+y²+z² > 1), discard
 *     it and try again.
 *
 * Every accepted point is uniform inside the unit ball by construction —
 * no transcendental functions needed.  The squared radius is compared
 * against 1 (not a square root against 1.0) to keep the hot loop free of
 * a sqrt.
 *
 * **Acceptance rate**: the unit sphere's volume is (4/3)π ≈ 4.189 against
 * the enclosing cube's 2³ = 8, a ratio of π/6 ≈ 52.4 %, so roughly one in
 * two cube samples is accepted (≈ 1.91 draws per accepted point).
 *
 * Scale the result by a radius at the call site to fill a sphere of any
 * size — the unit-ball shape is the reusable part.
 *
 * @param rand  A function returning a float in `[0, 1)`, e.g. a
 *              `mulberry32` closure.  Determinism is the caller's: the
 *              same seeded source yields the same sequence of points.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function uniformInSphere(rand: () => number): Vec3 {
  let x: number, y: number, z: number, r2: number;
  do {
    // Map three [0, 1) samples to the cube [−1, +1]³.
    x = rand() * 2 - 1;
    y = rand() * 2 - 1;
    z = rand() * 2 - 1;
    r2 = x * x + y * y + z * z;
  } while (r2 > 1); // reject points outside the unit sphere
  return [x, y, z];
}
