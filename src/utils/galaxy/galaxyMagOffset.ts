import { SDSS_TARGET_MEAN_MAG } from '../../data/galaxyCatalog/sdssTargetMeanMag';
import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';

/**
 * The cosmetic shift moving a catalog's mean finite `magG` onto the SDSS target
 * mean. `magG` holds whichever band the parser stored (2MRS J ~4–15, GLADE B
 * ~7–20); unshifted, 2MRS would clamp to full intensity with zero contrast.
 */
export function galaxyMagOffset(catalog: Pick<GalaxyCatalog, 'count' | 'magG'>): number {
  let magSum = 0;
  let magCount = 0;
  for (let i = 0; i < catalog.count; i++) {
    const m = catalog.magG[i]!;
    if (Number.isFinite(m)) {
      magSum += m;
      magCount++;
    }
  }
  const sourceMean = magCount > 0 ? magSum / magCount : SDSS_TARGET_MEAN_MAG;
  return SDSS_TARGET_MEAN_MAG - sourceMean;
}
