import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import { absoluteFromApparent } from '../math/absoluteFromApparent';

/**
 * galaxyMedianAbsMag — the per-catalog surface-brightness zero-point.
 *
 * Why per-catalog rather than one project-wide constant? Our three real
 * catalogs each store a different photometric band in `magG` — SDSS is
 * true g-band, 2MRS is near-infrared J, GLADE is B-band — so their raw
 * apparent magnitudes live on different numeric scales entirely (2MRS
 * galaxies read ~10 mag "brighter" in J than SDSS reads in g for a
 * similar physical galaxy). A single global absolute-magnitude reference
 * would therefore render one catalog's galaxies systematically too bright
 * or too dim relative to the others. Computing the zero-point once per
 * catalog and normalising each row against ITS OWN catalog's value
 * cancels the band offset, so `galaxySbAmp` output stays comparable
 * across catalogs even though the underlying photometry isn't.
 *
 * Why the MEDIAN and not the mean, and not a mean-with-a-sentinel-filter?
 * A mean is a fragile statistic for a job whose only purpose is to be a
 * stable zero-point: one row with a wild magnitude drags it arbitrarily
 * far, and the drag is invisible because the result is still a plausible
 * number. SDSS' `-9999` "no photometry" sentinel back-solves to an
 * absolute magnitude near -10040, which is FINITE, so it sails past every
 * guard here; 55 such rows in a 157k-row catalog moved the zero-point by
 * -3.5 mag, which `galaxySbAmp` turns into every galaxy in the catalog
 * rendering ~25x too dim. The median simply cannot be moved that way: it
 * is robust to any future contamination class, with no knowledge here of
 * what shape the contamination takes. On clean data the two agree —
 * sdss-medium reads -20.82 median against a -20.880 sentinel-free mean.
 *
 * Sentinel knowledge belongs in the parsers (`isPlausibleMagnitude`),
 * which repair the data itself and the tier ranking that reads it; this
 * file deliberately does NOT duplicate that list. The two are
 * complementary, not redundant: the parser stops bad data existing, the
 * median stops bad data mattering if any ever slips through — a new
 * source, a hand-built fixture, a corrupted download.
 *
 * `-20.5` is the same "no data" fallback the bake already uses (roughly
 * an L* absolute magnitude) — returned for an empty catalog so callers
 * never have to special-case count === 0.
 */
export function galaxyMedianAbsMag(cloud: GalaxyCatalog): number {
  // Collect into a Float64Array sized for the worst case and sort the
  // populated prefix. Building the array then sorting is O(n log n) on up
  // to a few million rows, which runs once per catalog load — a selection
  // algorithm would be asymptotically better but the typed-array sort is
  // native code, and this has never shown up next to the decode it follows.
  const values = new Float64Array(cloud.count);
  let count = 0;
  for (let i = 0; i < cloud.count; i++) {
    const m = cloud.magG[i]!;
    const x = cloud.positions[i * 3 + 0]!;
    const y = cloud.positions[i * 3 + 1]!;
    const z = cloud.positions[i * 3 + 2]!;
    const dMpc = Math.hypot(x, y, z);
    const M = absoluteFromApparent(m, dMpc);
    if (Number.isFinite(M)) {
      values[count] = M;
      count++;
    }
  }
  if (count === 0) return -20.5;

  const sorted = values.subarray(0, count).sort();
  const mid = count >> 1;
  // Even counts average the two central samples — the textbook definition.
  // Averaging two neighbours cannot reintroduce outlier sensitivity: both
  // are already central order statistics.
  return count % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
