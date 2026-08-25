/**
 * PlanetBody — a seeded scene body standing in for a planet.
 *
 * An authored data record in the same family as `EarthBody` (which is Earth's
 * specialised form, carrying a Blue Marble texture): an `id`/`label` for
 * identity and UI plus the constants that clothe the resolved sphere. The record
 * is identity only — a body's time-varying position and orientation live in its
 * `BodyState`, derived from the orbital elements by `deriveBodyStates`, never
 * baked here. A generic planet has no texture yet, so it is lit as a flat sphere
 * tinted by `albedo` (linear RGB, so it composites in the HDR pass); `radiusM`
 * is authored in SI metres and converted to draw space at render time, matching
 * `EarthBody.radiusM`.
 */

import type { Vec3 } from '../math/Vec3';

export type PlanetBody = {
  readonly id: string;
  readonly label: string;
  readonly radiusM: number; // metres; resolved to a sphere at render time
  readonly albedo: Vec3; // flat lit colour (no texture yet), linear RGB
};
