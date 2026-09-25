import type { ContactDecal } from '../../../src/@types/data/mesh/ContactDecal';
import type { MeshHoleRect } from '../../../src/@types/data/mesh/MeshHoleRect';
import type { MeshTextureField } from '../../../src/@types/data/mesh/MeshTextureField';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Geometry } from './Geometry';

/** `bakeTier`'s return: one tier's merged geometry plus whichever texture
 *  slots it had to substitute, for `bake` to fold into the ceiling row. */
export type BakeTierResult = {
  readonly geometry: Geometry;
  readonly substituted: readonly MeshTextureField[];
  readonly mean: Vec3;
  readonly contactDecal?: ContactDecal;
  readonly hole?: MeshHoleRect;
};
