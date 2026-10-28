import type { Vec2 } from '../../../src/@types/math/Vec2';

/**
 * MeshOrigin — where a baked mesh's origin lands. `surfaceCentroid` recentres on
 * the area-weighted surface centroid (a spacecraft's visible mass); `source` keeps
 * the source frame's origin (a shape model's centre of mass, which its orbit
 * tracks); `georeferenced` shifts by the ENU offset onto its `SurfaceFixedSite`.
 */
export type MeshOrigin =
  | { readonly kind: 'surfaceCentroid' }
  | { readonly kind: 'source' }
  | { readonly kind: 'georeferenced'; readonly centreM: Vec2 };
