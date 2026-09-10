/**
 * MeshBody — a seeded scene body drawn from a baked triangle mesh, not a
 * flat/textured sphere. Sits alongside `PlanetBody` in the presentation
 * partition; `meshKey` names the baked asset the mesh layer loads, and
 * `albedo` tints it the way `PlanetBody.albedo` tints a flat sphere.
 * Identity only — position/orientation live in `BodyState`, as for
 * `PlanetBody`.
 */

import type { Vec3 } from '../math/Vec3';

export type MeshBody = {
  readonly id: string;
  readonly label: string;
  readonly radiusM: number;
  readonly albedo: Vec3;
  readonly meshKey: string;
  readonly description: string;
  /** Per-body override of `clampDistance`'s Earth-tuned `SURFACE_STANDOFF_RADII` — every mesh body carries one; see `meshBody`. */
  readonly standoffRadii: number;
};
