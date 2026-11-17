import type { SceneBodyId } from '../../scene/SceneBodyId';

/** Where the sky arm stands: a place on a host, named by the frame tag and never by the pose. */
export type SkySpot = {
  readonly body: SceneBodyId;
  /** East-positive, IAU body-fixed (`surfacePointBodyFixed`'s convention). */
  readonly lonRad: number;
  /** Geodetic WGS84 laid straight onto the sphere, as `SurfaceFixedSite.latDeg`. */
  readonly latRad: number;
};
