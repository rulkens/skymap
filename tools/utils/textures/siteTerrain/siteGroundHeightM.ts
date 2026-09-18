import type { SurfaceFixedSite } from '../../../../src/@types/scene/SurfaceFixedSite';
import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';
import { deepestBandLevel } from './deepestBandLevel';
import { readGroundHeightM } from './readGroundHeightM';

/** siteGroundHeightM — ground height, metres above the datum, under `site`,
 *  off the deepest band that covers it. */
export function siteGroundHeightM(
  site: SurfaceFixedSite,
  manifest: SurfaceTileManifest,
): Promise<number> {
  const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);
  return readGroundHeightM(manifest, site.latDeg, site.lonDeg, z);
}
