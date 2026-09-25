import type { GeodeticAnchor } from '../../../src/@types/geo/GeodeticAnchor';

/** A `MeshSourceEntry.georeferenced` row: where the source's own origin sits
 *  in the real world, and the crop outline `buildMeshes` rasterises into the
 *  terrain-hole mask, shifted by the same anchor -> site translation. */
export type GeoreferencedMeshSource = {
  readonly anchor: GeodeticAnchor;
  /** Repo path of the committed crop ring (`ringM`, source ENU metres). */
  readonly holeOutline: string;
};
