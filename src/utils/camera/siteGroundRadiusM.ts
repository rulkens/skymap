/**
 * siteGroundRadiusM — a site's own baked ground radius: the host's datum plus
 * `SITE_GROUND_HEIGHTS`'s baked constant for it (F4). Every camera call site
 * that used to route a LIVE `terrainHeightAt` through to `sitePointBodyFixed`
 * composes it here instead, off the host's bare datum radius, since a site's
 * ground never changes and a live lookup only ever froze it at whatever a
 * paused clock or a not-yet-loaded tile answered first.
 */

import { SITE_GROUND_HEIGHTS } from '../../data/bodies/siteGroundHeights.generated';
import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';

export function siteGroundRadiusM(site: SurfaceFixedSite, hostDatumRadiusM: number): number {
  const heightM = SITE_GROUND_HEIGHTS[site.id];
  if (heightM === undefined) {
    throw new Error(`siteGroundRadiusM: no baked SITE_GROUND_HEIGHTS entry for '${site.id}'`);
  }
  return hostDatumRadiusM + heightM;
}
