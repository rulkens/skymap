/**
 * rotationFromIau — bake a body's IAU rotation elements into a single `Mat3`
 * that maps its local body-fixed frame into the equatorial world frame.
 *
 * ### Why the `Rz·Rx·Rz` composition
 *
 * The IAU/WGCCRE convention orients a body from three angles — north-pole RA α₀,
 * pole Dec δ₀, and prime meridian W₀ — via the standard three-rotation chain
 *
 *     R = Rz(90° + α₀) · Rx(90° − δ₀) · Rz(W₀).
 *
 * Read right-to-left as it acts on a body-fixed vector: `Rz(W₀)` spins the body
 * about its own pole to place the prime meridian; `Rx(90° − δ₀)` tips the pole
 * down from the zenith to declination δ₀; `Rz(90° + α₀)` swings that tilted pole
 * around to right ascension α₀ (the +90° puts the pole's azimuth at α₀ rather
 * than the node of the body equator). The result is the correct sky-fixed
 * orientation — its third column is the pole direction (cos δ cos α, cos δ sin α,
 * sin δ), so a body already at the equatorial north pole (δ = 90°) needs no tilt.
 *
 * ### Why a single `Mat3`
 *
 * The pole (α₀, δ₀) is fixed but the prime meridian W turns with the scene clock,
 * so `orientationForBody` recomposes this `Mat3` per derived instant from the
 * resolved W (the optional second argument; it defaults to the epoch W₀ so a
 * caller with no clock still gets the J2000 facing). Folding the whole
 * orientation into one matrix lets the renderer stay a plain matrix multiply,
 * with the trig confined to this compose step rather than the per-vertex path.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { RotationElements } from '../../@types/scene/RotationElements';
import { degToRad } from '../math/degToRad';
import { multiply3x3 } from '../math/multiply3x3';
import { rotXMat3 } from '../math/rotXMat3';

// Column-major elementary rotation (cell row r, column c at m[c*3 + r]); each
// column is the world image of a body-fixed basis vector under an active,
// right-handed (CCW) rotation of the given angle.
function rotZ(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

export function rotationFromIau(
  el: RotationElements,
  primeMeridianDeg: number = el.primeMeridianDeg,
): Mat3 {
  const spinAboutPole = rotZ(degToRad(primeMeridianDeg));
  const tipToDec = rotXMat3(degToRad(90 - el.poleDecDeg));
  const swingToRa = rotZ(degToRad(90 + el.poleRaDeg));

  return multiply3x3(multiply3x3(swingToRa, tipToDec), spinAboutPole);
}
