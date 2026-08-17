/**
 * Galaxy catalog constants — pure-functions-of-Source, eagerly cached.
 *
 * Three values per `Source` are constant for the lifetime of the runtime:
 *
 *   - `schechter` — the LF triple `(M*, α, φ*)` for the band that defines
 *     the galaxy catalog's flux limit (SDSS r-band, 2MRS K-band, GLADE B-band, …).
 *   - `mLim` — the galaxy catalog's apparent-magnitude flux limit (e.g. SDSS = 17.77).
 *   - `nRef` — the central-density normaliser
 *     `expectedNumberDensity({...schechter, mLim, dMpc: 10})`, the
 *     reference-point density at d = 10 Mpc.
 *
 * Pre-Spec-E these were stored on `LoadedSource` inside `GalaxyPointRenderer`,
 * recomputed at every `upload()`.  The recompute was ~free for the
 * Schechter triple (a Record-lookup) but non-trivial for `nRef` (a
 * 200-step trapezoidal integral inside `expectedNumberDensity`).  More
 * importantly, the values had no rendering reason to be on the renderer
 * — they're inputs to the bias-correction bake, not to any draw call.
 * Spec E moves them to a sibling table so the subsystem can look them
 * up without reaching into the renderer.
 *
 * ### Why eager (not lazy)
 *
 * Five sources × one `expectedNumberDensity` call each ≈ a few
 * milliseconds at module-init time.  The table is a top-level `const`
 * so consumers can rely on `galaxyCatalogConstants(source)` returning the
 * SAME object identity across calls — useful both as a cheap cache key
 * (the subsystem can compare references when deciding whether bake
 * inputs changed) and as a clear lifecycle signal (no "first call is
 * slower than the rest" surprise).
 *
 * Lazy memoisation would have the same behaviour after the first call
 * but with extra branching on every subsequent call.  With only five
 * sources, eager is strictly simpler.
 *
 * ### Why a sibling folder under `services/biasCorrection/`
 *
 * `services/biasCorrection/` is created by Spec E as a sibling to
 * `services/loading/` and `services/gpu/`.  It holds GPU-independent
 * bias-correction logic (this table today; possibly more later if we
 * extract more from the workers).  See the spec's *File layout* for
 * the placement rationale.
 *
 * @module
 */

import { GALAXY_CATALOG_SOURCES } from '../../data/sources';
import {
  galaxyCatalogFluxLimit,
  galaxyCatalogSchechter,
} from '../../data/galaxyCatalog/galaxyCatalogFluxLimits';
import { expectedNumberDensity } from '../../utils/math/expectedNumberDensity';
import type { GalaxyCatalogConstants } from '../../@types/math/GalaxyCatalogConstants';
import type { SourceType } from '../../@types/data/SourceType';

function buildOne(source: SourceType): GalaxyCatalogConstants {
  const schechter = galaxyCatalogSchechter(source);
  const mLim = galaxyCatalogFluxLimit(source);
  const nRef = expectedNumberDensity({
    ...schechter,
    mLim,
    dMpc: 10,
  });
  return { schechter, mLim, nRef };
}

// Eager-build the table at module init.  `Object.freeze` on each entry
// makes the misuse "subsystem mutates a constants record" impossible —
// the entries are shared across the subsystem, the renderer (post-E.2
// reads), and any future consumer.
const TABLE: Record<SourceType, GalaxyCatalogConstants> = GALAXY_CATALOG_SOURCES.reduce(
  (acc, src) => {
    acc[src] = Object.freeze(buildOne(src));
    return acc;
  },
  {} as Record<SourceType, GalaxyCatalogConstants>,
);

/**
 * Look up the cached `GalaxyCatalogConstants` for a source.  Identity-stable
 * across calls; safe to use as a Map key.
 */
export function galaxyCatalogConstants(source: SourceType): GalaxyCatalogConstants {
  return TABLE[source];
}
