/**
 * PlanetBody — a seeded scene body standing in for a planet.
 *
 * An authored data record in the same family as `EarthBody` (which is Earth's
 * specialised form, carrying a Blue Marble texture): an `id`/`label` for
 * identity and UI, an absolute `positionMpc`, and the constants that clothe the
 * resolved sphere. A generic planet has no texture yet, so it is lit as a flat
 * sphere tinted by `albedo` (linear RGB, so it composites in the HDR pass);
 * `radiusKm` stays in kilometres — the body's native unit — and is converted to
 * draw space at render time, matching `EarthBody.radiusKm`.
 *
 * `positionMpc` stays a `Vec3` (never a raw tuple) so every position site
 * speaks the one absolute heliocentric, f64-valued frame.
 *
 * `orientation` is the body's local → equatorial-world rotation, baked once from
 * its IAU rotation elements (`rotationFromIau(rotationById(id))`). A body with no
 * texture is rotation-invariant, so an irregular moon carries `IDENTITY_MAT3` —
 * the honest "no facing modelled" value. The renderer folds this `Mat3` between
 * the translate and scale of its model matrix, so the shader stays a plain
 * multiply with no per-vertex trig.
 */

import type { Vec3 } from '../math/Vec3';
import type { Mat3 } from '../math/Mat3';

export type PlanetBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
  readonly radiusKm: number; // native unit; resolved to a sphere at render time
  readonly albedo: Vec3; // flat lit colour (no texture yet), linear RGB
  readonly orientation: Mat3; // local → equatorial-world, baked from ROTATION_ELEMENTS
};
