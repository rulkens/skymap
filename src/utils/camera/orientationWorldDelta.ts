/**
 * orientationWorldDelta — `currentOrientation · inverse(orientationAtFlip)`,
 * the WORLD-SPACE rotation a focused body has picked up since the flip
 * snapshot. Surface-fixed follow (spec §4.6) left-multiplies this onto
 * `poseBasis`/`upBasis` so the camera co-rotates with the body's actual
 * spin axis in world space, holding a body-surface point fixed under it.
 *
 * ### Why NOT `inverse(orientationAtFlip) · currentOrientation`
 *
 * A body's baked orientation is `O(t) = C · Rz(W(t))` (`rotationFromIau.ts`):
 * `Rz(W(t))` is the spin, composed in BODY-LOCAL coordinates (right operand),
 * and `C = Rz(90+α₀)·Rx(90−δ₀)` is the fixed pole tilt/swing, applied on the
 * LEFT to carry that local spin into world space. So
 * `inverse(O₁)·O₂ = Rz(ΔW)` — a rotation about WORLD Z, regardless of the
 * body's actual pole. That coincides with the body's real spin axis only
 * when `C` is itself a Z-rotation, i.e. `poleDecDeg = 90°` — true for Earth
 * in `rotationElements.ts` and no other body there, so that formula silently
 * corrected the wrong axis everywhere except Earth.
 *
 * The world-space delta is instead `O₂·O₁⁻¹ = C·Rz(ΔW)·C⁻¹` — `Rz(ΔW)`
 * conjugated by the pole tilt, i.e. a rotation about the body's OWN tilted
 * pole. That is what "holds a ground point fixed as the body spins" means:
 * a body-local point's world image moves as `O(t)·p_local`, so keeping
 * `O₁⁻¹·(world direction)` constant requires the world direction itself to
 * pick up `O₂·O₁⁻¹` between the two instants.
 *
 * At the engage frame `orientationAtFlip === currentOrientation`, so the
 * delta is exactly `I` and the flip introduces no pose jump (the property
 * `runFrame.test.ts` pins) — true under either operand order, which is why
 * an identity-orientation regression alone (Phobos) cannot distinguish the
 * two; a tilted-pole body (Moon/Mars) is required.
 *
 * Both inputs are orthonormal rotations, so `inverse(R) = Rᵀ` — no general
 * 3×3 inversion needed. Written as a tight 9-float transpose-and-dot, the
 * same locality `camPosLocal.ts` uses for its own `Rᵀ · offset`, rather than
 * building a transposed `Mat3` and routing through the generic `multiply3x3`.
 */

import type { Mat3 } from '../../@types/math/Mat3';

export function orientationWorldDelta(
  orientationAtFlip: Readonly<Mat3>,
  currentOrientation: Readonly<Mat3>,
): Mat3 {
  const a = orientationAtFlip;
  const b = currentOrientation;
  // result[c*3+r] = (row r of b) · (row c of a) — column-major `B·Aᵀ`: row r
  // of a matrix occupies indices {r, 3+r, 6+r} (one entry per column), unlike
  // a column's contiguous {r*3, r*3+1, r*3+2}.
  return [
    b[0] * a[0] + b[3] * a[3] + b[6] * a[6],
    b[1] * a[0] + b[4] * a[3] + b[7] * a[6],
    b[2] * a[0] + b[5] * a[3] + b[8] * a[6],
    b[0] * a[1] + b[3] * a[4] + b[6] * a[7],
    b[1] * a[1] + b[4] * a[4] + b[7] * a[7],
    b[2] * a[1] + b[5] * a[4] + b[8] * a[7],
    b[0] * a[2] + b[3] * a[5] + b[6] * a[8],
    b[1] * a[2] + b[4] * a[5] + b[7] * a[8],
    b[2] * a[2] + b[5] * a[5] + b[8] * a[8],
  ];
}
