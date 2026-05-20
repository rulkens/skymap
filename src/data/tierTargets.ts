/**
 * tierTargets — per-tier per-source point-count caps and filename mapping.
 *
 * ### Why a Partial<Record<Source, number>> instead of full coverage
 *
 * The three encodings — missing key / 0 / positive N — give us three distinct
 * semantics in one tiny table:
 *
 *   missing key  → no cap; ship the source unchanged (used for 2MRS + Famous,
 *                  which are already small and need no subsampling).
 *   0            → exclude this source from this tier entirely (small drops
 *                  SDSS to keep the total under the mobile GPU budget).
 *   positive N   → keep the brightest N galaxies by absolute magnitude (the
 *                  volume-limited cut applied at build time).
 *
 * Encoding "no cap" as missing-key (rather than +Infinity) means a builder can
 * write `if (target === undefined) skip subsampling` without sentinel-equality
 * gymnastics, and the table reads as "this tier is mostly defaults; here are
 * the exceptions" — exactly the correct mental model.
 *
 * ### Why fixed integer targets (not a fraction)
 *
 * Rendering load scales with on-screen instance count, which is bounded by the
 * total uploaded count, which is what these numbers control.  Fractions like
 * "10% of GLADE" would shift if GLADE itself grew (e.g. v2.4 release), and the
 * mobile-GPU budget is an absolute number of points, not a percentage.
 *
 * ### Why filename suffixes for subsampled sources only
 *
 * 2MRS (~44k) and Famous (~150) are tier-agnostic — the same .bin works at
 * every tier — so they keep their existing filenames (`2mrs.bin`, `famous.bin`)
 * and live in one place on the static host.  SDSS and GLADE get a `-small`,
 * `-medium`, `-large` suffix because each tier's cut is a different file.
 */

import { Source, SOURCE_REGISTRY } from './sources';
import type { Tier } from '../@types/data/Tier';

/**
 * Tier-target table.  Order: small, medium, large.
 *
 * Targets in points (galaxies).  Missing key = no cap.  See module doc for
 * the semantics of each encoding.
 */
export const TIER_TARGETS: Record<Tier, Partial<Record<Source, number>>> = {
  small: {
    [Source.SDSS]: 0, // mobile budget — drop SDSS entirely
    [Source.Glade]: 256_000, // brightest 256k
    [Source.Milliquas]: 0, // mobile budget — drop Milliquas entirely
    // 2MRS + Famous: missing → use full source
  },
  medium: {
    [Source.SDSS]: 156_000, // brightest ~156k
    [Source.Glade]: 400_000, // brightest 400k
    // 200k is a first guess — revisit after visualising the medium tier.
    // Milliquas ships ~943k accepted records out of the box; trimming to
    // the brightest 200k by absolute mag mirrors the GLADE-medium cap
    // and keeps the medium-tier point budget within range of the SDSS
    // and GLADE caps next to it.
    [Source.Milliquas]: 200_000,
    // 2MRS + Famous: missing → use full source
  },
  large: {
    // No caps anywhere — the full pre-tier behaviour.
  },
};

/**
 * Returns the on-disk filename for a (source, tier) pair.
 *
 * For tiered sources (`entry.tiered === true`) we append `-<tier>` before
 * `.bin` so the three variants coexist on the static host. For non-tiered
 * sources (2MRS, Famous) we return the bare filename — every tier loads
 * the same file.
 *
 * Throws on `Source.Synthetic` because synthetic data is generated at runtime
 * and has no filename. Throwing rather than returning a sentinel string keeps
 * a buggy caller loud instead of silently 404-ing.
 */
export function tierFilenameForSource(source: Source, tier: Tier): string {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'survey' || entry.binBaseName === null) {
    throw new Error(`tierFilenameForSource: no base filename for source ${source}`);
  }
  if (entry.tiered) return `${entry.binBaseName}-${tier}.bin`;
  return `${entry.binBaseName}.bin`;
}
