/**
 * tierTargets — per-tier subsampling and filename helpers.
 *
 * The actual per-(source, tier) caps live on each `SurveySourceEntry`'s
 * `tierTargets` field (see `src/data/sources.ts`); this module only
 * exposes the two helpers that read it.
 *
 * ### Three encodings, same semantics as before
 *
 *   missing key  → no cap; ship the source unchanged.
 *   0            → exclude this source from this tier entirely (the build
 *                  skips writing the file; runtime gets a 404).
 *   positive N   → keep the brightest N galaxies by absolute magnitude.
 *
 * Encoding "no cap" as missing-key (rather than +Infinity) means a
 * builder can write `if (target === undefined) skip subsampling` without
 * sentinel-equality gymnastics.
 *
 * ### Why fixed integer targets (not a fraction)
 *
 * Rendering load scales with on-screen instance count, which is bounded
 * by the total uploaded count.  Fractions like "10% of GLADE" would shift
 * if GLADE itself grew (e.g. v2.4 release), and the mobile-GPU budget is
 * an absolute number of points, not a percentage.
 *
 * ### Why filename suffixes for subsampled sources only
 *
 * Tier-agnostic surveys (2MRS, Famous) keep their bare filenames
 * (`2mrs.bin`, `famous.bin`) and live in one place on the static host.
 * Tiered surveys (SDSS, GLADE, Milliquas) get a `-small`, `-medium`,
 * `-large` suffix because each tier's cut is a different file.
 */

import { Source, SOURCE_REGISTRY } from './sources';
import type { Tier } from '../@types/data/Tier';

/**
 * Returns the per-tier point-count cap for a source, or `undefined` for
 * "no cap" (and for non-survey sources, which can never be subsampled).
 *
 * Caller semantics:
 *   undefined  → ship the full source.
 *   0          → exclude this source from this tier.
 *   positive N → keep the brightest N.
 */
export function tierTarget(source: Source, tier: Tier): number | undefined {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'survey') return undefined;
  // The `as const` on SOURCE_REGISTRY narrows each entry's `tierTargets`
  // to its own literal shape (e.g. `{ small: 0, medium: 156_000 }`),
  // so the union here can't be indexed by a generic `Tier` without
  // widening back to the declared shape.
  const targets: Partial<Record<Tier, number>> = entry.tierTargets;
  return targets[tier];
}

/**
 * Returns the on-disk filename for a (source, tier) pair.
 *
 * A survey is "tiered" — i.e. ships per-tier `.bin` variants — iff it
 * carries any per-tier cap.  Sources with an empty `tierTargets` (2MRS,
 * Famous) reuse a single file across every tier and get the bare name.
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
  const targets: Partial<Record<Tier, number>> = entry.tierTargets;
  if (Object.keys(targets).length > 0) return `${entry.binBaseName}-${tier}.bin`;
  return `${entry.binBaseName}.bin`;
}
