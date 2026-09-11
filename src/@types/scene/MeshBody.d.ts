/**
 * MeshBody — a seeded scene body drawn from a baked triangle mesh, not a
 * flat/textured sphere. `meshKey` names the baked asset the mesh layer loads.
 * Identity only — position/orientation live in `BodyState`, as for `PlanetBody`.
 */

import type { Vec3 } from '../math/Vec3';

export type MeshBody = {
  readonly id: string;
  readonly label: string;
  /** Baked bounding sphere (hull + booms), metres — a footprint, NOT a surface:
   *  nothing about it is ground the camera can stand on. */
  readonly boundingRadiusM: number;
  readonly albedo: Vec3;
  readonly meshKey: string;
  /** Camera standoff floor, in body radii, replacing `clampDistance`'s
   *  Earth-tuned `SURFACE_STANDOFF_RADII` (which would park the camera microns
   *  off a metre-scale hull). Not a per-body dial: the `meshBody` maker stamps
   *  every row with the same `MESH_BODY_STANDOFF_RADII`. */
  readonly standoffRadii: number;
  /** Distance from the camera, in metres, at which this body's caption reaches
   *  full alpha; it fades in from zero at twice that distance. Optional — a
   *  mesh body that omits it keeps the `meshBody` fade row's default reach. */
  readonly captionRevealM?: number;
};
