/**
 * skyPositionAngleToFrameAngle — a published sky position angle (measured North
 * through East) → the ascending node Ω of `GALACTIC_CENTRE_SKY_FRAME`, radians.
 *
 * Astrometric orbits (Gillessen+2017) are referenced to the basis
 * `(North, East, away-from-observer)`, which is LEFT-handed; the plane frame's
 * `(East, North, away)` is right-handed. The map between them is the component
 * swap `P` with `det P = −1`, and `P·Rz(θ)·P = Rz(−θ)`, so Ω is re-measured
 * from East and runs the other way round the normal: `Ω_frame = 90° − Ω_astro`.
 *
 * That same handedness change also lands on the inclination — see
 * `skyInclinationToFrameInclination`, the half of the conversion that is easy
 * to omit, because ω genuinely passes through untouched.
 */

import { degToRad } from '../math/degToRad';

export function skyPositionAngleToFrameAngle(omegaAstroDeg: number): number {
  return degToRad(90 - omegaAstroDeg);
}
