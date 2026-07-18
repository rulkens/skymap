/**
 * EarthBody — a seeded scene body standing in for planet Earth.
 *
 * The record carries authored constants, not runtime-derived state: an
 * `id`/`label` for identity and UI, the body's absolute `positionMpc`, its
 * physical `radiusKm`, and the baked `orientation` that aims the sphere. The
 * Blue Marble skin is no longer a per-body `textureUrl`: Earth now rides the
 * keyed `bodyTextures` slot family alongside the other textured bodies, so the
 * texture is demanded by proximity through the registry, not authored here.
 *
 * `positionMpc` is canonical megaparsecs — the same absolute heliocentric
 * frame every catalogue position lives in — authored via `SCALE_UNITS` so a
 * kilometre-scale body still resolves to a valid `Vec3` at parsec precision.
 * It stays a `Vec3` (never a raw tuple) so every position site speaks one
 * language. `radiusKm` is left in kilometres, the body's native unit, and is
 * resolved into a draw-space sphere by `composeBodyMvp` at render time rather
 * than being pre-scaled into Mpc here — keeping the authored number legible
 * and the unit conversion in one place.
 */

import type { Vec3 } from '../math/Vec3';
import type { Mat3 } from '../math/Mat3';

export type EarthBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
  readonly radiusKm: number; // 6371
  readonly orientation: Mat3; // local → equatorial-world, baked from ROTATION_ELEMENTS
};
