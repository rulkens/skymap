/**
 * The HOST body's descent floor expressed as an eye height above a site's
 * tangent plane — negative where that floor sits below the site. The site
 * rung rates its own ground in the ROVER's bounding radii (~0.5 m), so without
 * this a ground-level view hands back UNDER the host arm's floor and the first
 * body-arm notch spends the difference as a radial shove (spec §4.5).
 */

import type { HostBody } from '../../@types/camera/HostBody';
import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import { surfaceFloorM } from './surfaceFloorM';

export function hostFloorAboveSiteM(site: SurfaceFixedSite, host: HostBody): number {
  // `sitePointBodyFixed` places the site at `radius + altitude` from the centre.
  return surfaceFloorM(host.radiusM, host.standoffRadii) - (host.radiusM + site.altitudeM);
}
