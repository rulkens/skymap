import type { Vec3 } from '../../math/Vec3';

/** A mesh body's ground-contact box, body frame, metres — `buildMeshes` remaps
 *  it from the GLB's `extras.contactDecal` the same way it remaps vertices. */
export type ContactDecal = {
  readonly centre: Vec3;
  readonly halfU: Vec3;
  readonly halfV: Vec3;
};
