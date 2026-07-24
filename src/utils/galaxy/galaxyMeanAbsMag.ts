import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import { absoluteFromApparent } from '../math/absoluteFromApparent';

/**
 * galaxyMeanAbsMag — the per-catalog surface-brightness zero-point.
 *
 * Why per-catalog rather than one project-wide constant? Our three real
 * catalogs each store a different photometric band in `magG` — SDSS is
 * true g-band, 2MRS is near-infrared J, GLADE is B-band — so their raw
 * apparent magnitudes live on different numeric scales entirely (2MRS
 * galaxies read ~10 mag "brighter" in J than SDSS reads in g for a
 * similar physical galaxy). A single global mean-absolute-magnitude
 * reference would therefore render one catalog's galaxies systematically
 * too bright or too dim relative to the others. Computing the mean once
 * per catalog and normalising each row against ITS OWN catalog's mean
 * cancels the band offset, so `galaxySbAmp` output stays comparable
 * across catalogs even though the underlying photometry isn't.
 *
 * `-20.5` is the same "no data" fallback the bake already uses (roughly
 * an L* absolute magnitude) — returned for an empty catalog so callers
 * never have to special-case count === 0.
 */
export function galaxyMeanAbsMag(cloud: GalaxyCatalog): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < cloud.count; i++) {
    const m = cloud.magG[i]!;
    const x = cloud.positions[i * 3 + 0]!;
    const y = cloud.positions[i * 3 + 1]!;
    const z = cloud.positions[i * 3 + 2]!;
    const dMpc = Math.hypot(x, y, z);
    const M = absoluteFromApparent(m, dMpc);
    if (Number.isFinite(M)) {
      sum += M;
      count++;
    }
  }
  return count > 0 ? sum / count : -20.5;
}
