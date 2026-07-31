/**
 * skyInclinationToFrameInclination — a published sky inclination → the
 * inclination about `GALACTIC_CENTRE_SKY_FRAME`'s outward normal, in radians.
 *
 * `i_frame = 180° − i_astro`. Omitting this flip mirrors every orbit while
 * pericentre, period and body-on-its-own-trail all stay exactly right, so no
 * analytic invariant catches it; only the projected sky positions do.
 *
 * Why a flip at all: the astrometric basis `(North, East, away)` is LEFT-handed
 * and the frame's `(East, North, away)` is right-handed, so the component swap
 * `P` between them reverses orientation. Conjugating the rotation
 * `R = Rz(Ω)·Rx(i)·Rz(ω)` that `keplerianEllipse` builds through `P` uses
 * `P·Rz(θ)·P = Rz(−θ)` and `P·Rx(θ)·P = Ry(−θ)`; `P` additionally swaps the
 * perifocal seed `(cos ν, sin ν, 0) → (sin ν, cos ν, 0)`, running the in-plane
 * angle backwards. Absorbing that reversal with `Rx(180°)` collapses the whole
 * product to `Rz(90° − Ω)·Rx(180° − i)·Rz(ω)` — the correction lands on i, and
 * ω is left alone.
 *
 * Physically: `i_astro < 90°` is counter-clockwise on the sky, so the angular
 * momentum points at the observer, so `i_frame > 90°` about a normal pointing
 * away. S2's tabulated 134.18° (clockwise on the sky) becomes 45.82°.
 */

import { degToRad } from '../math/degToRad';

export function skyInclinationToFrameInclination(iAstroDeg: number): number {
  return degToRad(180 - iAstroDeg);
}
