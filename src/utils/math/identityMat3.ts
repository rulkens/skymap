/**
 * IDENTITY_MAT3 — the shared column-major 3×3 identity rotation.
 *
 * This is the "no facing modelled" orientation: a flat-albedo or emissive body
 * (an irregular moon, the Sun) is rotation-invariant, so it carries the identity
 * rather than a `rotationFromIau` matrix. Kept as one frozen constant so those
 * callers don't each re-spell `[1,0,0, 0,1,0, 0,0,1]` — an identity that appears
 * literally in several places is exactly the constant that earns a single home.
 *
 * `Readonly` because it is a shared singleton; anything needing a mutable copy
 * spreads it into a fresh array.
 */

import type { Mat3 } from '../../@types/math/Mat3';

export const IDENTITY_MAT3: Readonly<Mat3> = [1, 0, 0, 0, 1, 0, 0, 0, 1];
