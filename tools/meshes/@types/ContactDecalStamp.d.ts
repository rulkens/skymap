import type { Vec3 } from '../../../src/@types/math/Vec3';

/** The prebake's `extras.contactDecal`, glTF frame — `buildMeshes` bakes it into a `ContactDecal`. */
export type ContactDecalStamp = {
  readonly centre: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
};
