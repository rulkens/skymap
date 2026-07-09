/**
 * EarthBody — a seeded scene body standing in for planet Earth.
 *
 * The record carries authored constants, not runtime-derived state: an
 * `id`/`label` for identity and UI, the body's absolute `positionMpc`, its
 * physical `radiusKm`, and the equirectangular Blue Marble `textureUrl` that
 * clothes the sphere.
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

export type EarthBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
  readonly radiusKm: number; // 6371
  readonly textureUrl: string; // Blue Marble equirectangular
};
