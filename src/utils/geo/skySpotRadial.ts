import type { SkySpot } from '../../@types/camera/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';

/** The spot's unit radial in its host's body-fixed axes (`surfacePointBodyFixed`'s convention, radians in). */
export function skySpotRadial({ lonRad, latRad }: SkySpot): Vec3 {
  const ring = Math.cos(latRad);
  return [ring * Math.cos(lonRad), ring * Math.sin(lonRad), Math.sin(latRad)];
}
