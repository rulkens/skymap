import type { MeshHoleRect } from '../../data/mesh/MeshHoleRect';

/** The terrain hole a surface-tile draw cuts: the resident holed mesh's R8
 *  mask (owned by `meshBodyRenderer`, row 0 = north) over its lat/lon rect. */
export type SurfaceTileHole = {
  readonly mask: GPUTexture;
  readonly rect: MeshHoleRect;
};
