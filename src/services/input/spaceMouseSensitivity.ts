/**
 * spaceMouseSensitivity — apply a non-linear response curve to normalised
 * SpaceMouse axes for fine-control feel.
 *
 * ### Why cube the input?
 *
 * Linear mapping (raw axis → camera rate) feels twitchy near zero: the
 * puck has noticeable mechanical play, and even a 5% deflection is enough
 * to swing the camera around at appreciable speed. Cubing the input makes
 * the response gentle near rest and aggressive at full deflection:
 *
 *     y = x³  is dominated by x near zero (x³ ≈ 0)
 *             and rises sharply toward x = ±1
 *
 * This is the same curve that 3Dconnexion's own driver applies in its
 * default profile, and it makes precision pointing (e.g. nudging a target
 * by a few pixels) actually feasible. We preserve sign with `Math.sign`
 * because `Math.pow(-0.5, 3)` would return NaN in some engines for
 * non-integer exponents — the standard idiom for odd-power curves on
 * signed inputs is `sign(x) * |x|^p`.
 *
 * ### Sensitivity scalar
 *
 * After cubing we multiply by a user-controlled scalar so the settings
 * panel can globally scale all axes without changing the curve shape. A
 * value of 1.0 is the "factory" feel; the slider lets the user dial it
 * from 0.1 (very damped) to 3.0 (very twitchy) per the spec.
 */

import type { SpaceMouseAxes } from '../../@types/input/SpaceMouseAxes';

/**
 * Apply a cubic response curve plus a global sensitivity multiplier to all
 * six axes of a `SpaceMouseAxes` reading.
 *
 * Returns a NEW object so callers can safely mutate or store the result
 * without aliasing the input. The input is not modified.
 *
 * @param axes        Normalised axes from a report parser, each in [-1, 1].
 * @param sensitivity Global multiplier applied after the cube; > 0.
 * @returns           A new axes object with the curve and scale applied.
 */
export function applyCurve(axes: SpaceMouseAxes, sensitivity: number): SpaceMouseAxes {
  return {
    tx: curve(axes.tx, sensitivity),
    ty: curve(axes.ty, sensitivity),
    tz: curve(axes.tz, sensitivity),
    rx: curve(axes.rx, sensitivity),
    ry: curve(axes.ry, sensitivity),
    rz: curve(axes.rz, sensitivity),
  };
}

/**
 * The per-axis curve. Extracted for clarity and so future variants (quintic,
 * hermite, etc.) can be swapped here without touching the dispatch in
 * `applyCurve`.
 *
 * `Math.sign(0) === 0`, so a zero input maps to a zero output even after
 * the multiplication — no special-case needed.
 */
function curve(x: number, sensitivity: number): number {
  return Math.sign(x) * Math.pow(Math.abs(x), 3) * sensitivity;
}
