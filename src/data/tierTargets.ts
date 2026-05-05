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

import { Source } from './sources';
import type { Tier } from '../@types/Tier';

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
    // 2MRS + Famous: missing → use full source
  },
  medium: {
    [Source.SDSS]: 156_000, // brightest ~156k
    [Source.Glade]: 400_000, // brightest 400k
    // 2MRS + Famous: missing → use full source
  },
  large: {
    // No caps anywhere — the full pre-tier behaviour.
  },
};

/**
 * The set of sources that get per-tier filename suffixes.  Everything not in
 * this set keeps a single file shared across tiers.
 */
const TIERED_SOURCES: ReadonlySet<Source> = new Set([Source.SDSS, Source.Glade]);

/** Base (tier-agnostic) filename per source.  Used unchanged for non-tiered sources. */
const BASE_FILENAMES: Partial<Record<Source, string>> = {
  [Source.SDSS]: 'sdss',
  [Source.TwoMRS]: '2mrs',
  [Source.Glade]: 'glade',
  [Source.Famous]: 'famous',
};

/**
 * Returns the on-disk filename for a (source, tier) pair.
 *
 * For tiered sources (SDSS, GLADE) we append `-<tier>` before `.bin` so the
 * three variants coexist on the static host.  For non-tiered sources (2MRS,
 * Famous) we return the bare filename — every tier loads the same file.
 *
 * Throws on `Source.Synthetic` because synthetic data is generated at runtime
 * and never has a filename.  Throwing rather than returning a sentinel string
 * keeps a buggy caller loud instead of silently 404-ing.
 */
export function tierFilenameForSource(source: Source, tier: Tier): string {
  const base = BASE_FILENAMES[source];
  if (!base) throw new Error(`tierFilenameForSource: no base filename for source ${source}`);
  if (TIERED_SOURCES.has(source)) return `${base}-${tier}.bin`;
  return `${base}.bin`;
}
