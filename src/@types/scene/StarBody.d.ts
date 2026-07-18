/**
 * StarBody — a seeded scene body standing in for a star (chiefly the Sun).
 *
 * Like the other scene bodies, this is an authored data record rather than
 * runtime-derived state: an `id`/`label` for identity and UI, an absolute
 * `positionMpc`, and the photometric constants that drive how it is drawn.
 *
 * A star renders two ways over the descent. Far out it is a point whose
 * brightness and on-screen size come from `absMag` (the same absolute-magnitude
 * quantity the catalogue point cloud uses, so the LOD crossover is one
 * language) tinted by `color` (which derives from the star's blackbody
 * `temperatureK`, in linear RGB so it composites correctly in the HDR pass).
 * Up close — the Sun in the local neighbourhood — it resolves into a lit sphere
 * sized from `radiusKm`, the real per-star value, left in kilometres (the
 * body's native unit) and converted to draw space at render time, matching
 * `EarthBody.radiusKm`.
 *
 * `positionMpc` stays a `Vec3` (never a raw tuple) so every position site
 * speaks the one absolute heliocentric, f64-valued frame.
 */

import type { Vec3 } from '../math/Vec3';

export type StarBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
  readonly absMag: number; // drives point brightness/size + LOD
  readonly color: Vec3; // blackbody colour from temperatureK, linear RGB
  readonly radiusKm: number; // used once resolved to a sphere (the Sun)
  readonly oblateness?: number; // flattening (a−c)/a; absent ⇒ spherical; feeds per-axis MVP scale
};
