/**
 * tierTargets — per-tier subsampling and filename helpers.
 *
 * The actual per-(source, tier) caps live on each `GalaxyCatalogSourceEntry`'s
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
 */

import { SOURCE_REGISTRY } from './sources';
import { GALAXY_CATALOG_DATA_PREFIX } from './galaxyCatalog/galaxyCatalogFormat';
import { shipsTierVariants } from '../utils/loading/shipsTierVariants';
import type { Tier } from '../@types/data/Tier';
import type { SourceType } from '../@types/data/SourceType';

/**
 * Returns the per-tier point-count cap for a source, or `undefined` for
 * "no cap" (and for non-galaxy catalog sources, which can never be subsampled).
 *
 * Caller semantics:
 *   undefined  → ship the full source.
 *   0          → exclude this source from this tier.
 *   positive N → keep the brightest N.
 */
export function tierTarget(source: SourceType, tier?: Tier): number | undefined {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog' || tier === undefined) return undefined;
  // The `as const` on SOURCE_REGISTRY narrows each entry's `tierTargets`
  // to its own literal shape (e.g. `{ small: 0, medium: 156_000 }`),
  // so the union here can't be indexed by a generic `Tier` without
  // widening back to the declared shape.
  const targets: Partial<Record<Tier, number>> = entry.tierTargets;
  return targets[tier];
}

/**
 * Returns the apparent-magnitude flux floor for a source's local-volume
 * supplement, or `undefined` for "no supplement" (and for every non-galaxy catalog
 * source, which can't be subsampled). Mirrors {@link tierTarget}: a thin,
 * type-narrowing read of the registry so callers don't reach into the
 * discriminated union themselves. Tier-independent — the floor is a single
 * per-source value the build applies to whichever tier is being capped.
 */
export function fluxSupplementMagLimitFor(source: SourceType): number | undefined {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog') return undefined;
  // `as const` narrows each entry to its own literal shape, so entries that
  // omit the optional field don't declare it — `in` narrows to the ones that do.
  return 'fluxSupplementMagLimit' in entry ? entry.fluxSupplementMagLimit : undefined;
}

/**
 * Returns the `GALAXY_CATALOG_DATA_PREFIX`-relative path for a (source, tier)
 * pair — e.g. `galaxy-catalog/v9/sdss-large.bin`. This is the single site
 * both the browser fetcher (`galaxyCatalogFetcher`, via `dataUrl`) and
 * `buildAllBins` (writing to disk) read, which is what keeps the fetch URL
 * and the on-disk layout from diverging.
 *
 * An absent `tier` is the request shape of a source that ships one file for every
 * tier (see `shipsTierVariants`); a variant-shipping source needs one, and throwing
 * keeps a request that has lost its tier loud instead of building `…-undefined.bin`.
 *
 * Throws on `Source.Synthetic` because synthetic data is generated at runtime
 * and has no filename. Throwing rather than returning a sentinel string keeps
 * a buggy caller loud instead of silently 404-ing.
 */
export function tierFilenameForSource(source: SourceType, tier?: Tier): string {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog' || entry.binBaseName === null) {
    throw new Error(`tierFilenameForSource: no base filename for source ${source}`);
  }
  if (!shipsTierVariants(entry.tierTargets)) {
    return `${GALAXY_CATALOG_DATA_PREFIX}/${entry.binBaseName}.bin`;
  }
  if (tier === undefined) {
    throw new Error(
      `tierFilenameForSource: source ${source} ships per-tier variants, no tier given`,
    );
  }
  return `${GALAXY_CATALOG_DATA_PREFIX}/${entry.binBaseName}-${tier}.bin`;
}
