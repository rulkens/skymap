import type { GeodeticAnchor } from '../../../src/@types/geo/GeodeticAnchor';

/** A `MeshSourceEntry.georeferenced` row: where the source's own origin sits
 *  in the real world, before `buildMeshes` shifts the mesh onto its
 *  `SurfaceFixedSite`. */
export type GeoreferencedMeshSource = {
  readonly anchor: GeodeticAnchor;
};
