/**
 * orientationForBody — bake a scene body's local → equatorial-world rotation
 * from its id, reading the one textured-body registry rather than a second list.
 *
 * This is the single choice site the body makers (`heliocentricPlanet`,
 * `satelliteBody`) and `sceneEarth` all bake orientation through, so the
 * registry-keyed decision lives once instead of being re-spelled per maker.
 *
 * A body only needs a facing where a texture rides its surface: if the id keys
 * `BODY_TEXTURE_REGISTRY` (via `bodyTextureSpec`, the "is textured?" predicate),
 * its orientation is composed from the authored IAU rotation elements. Otherwise —
 * an irregular moon, Titan, anything rotation-invariant — it carries
 * `IDENTITY_MAT3`, the honest "no facing modelled" value rather than a fabricated
 * pole. Membership in the texture registry is the sole gate, so a body is
 * oriented exactly when (and because) it is textured.
 *
 * `simDays` (a JD-like scalar) turns the prime meridian: the live meridian is
 * `W = W₀ + Ẇ·(simDays − J2000)`, so at `CONST_J2000` the offset is zero and the
 * result is the epoch facing, byte-identical to the pre-clock bake. A rotation-
 * invariant body carries no meridian, so its identity is `simDays`-independent.
 */

import { bodyTextureSpec } from './bodyTextureRegistry';
import { rotationById } from './rotationElements';
import { CONST_J2000 } from '../time/constJ2000';
import { rotationFromIau } from '../../utils/orbit/rotationFromIau';
import { IDENTITY_MAT3 } from '../../utils/math/identityMat3';
import type { Mat3 } from '../../@types/math/Mat3';

export function orientationForBody(id: string, simDays: number): Mat3 {
  // A fresh mutable copy of the shared readonly identity — the body record's
  // `orientation` is a mutable `Mat3`, and each body owns its own array.
  if (!bodyTextureSpec(id)) return [...IDENTITY_MAT3] as Mat3;

  const el = rotationById(id);
  const primeMeridianDeg = el.primeMeridianDeg + el.spinRateDegPerDay * (simDays - CONST_J2000);
  return rotationFromIau(el, primeMeridianDeg);
}
