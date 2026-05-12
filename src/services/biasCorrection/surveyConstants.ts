/**
 * Survey constants — pure-functions-of-Source, eagerly cached.
 *
 * Three values per `Source` are constant for the lifetime of the runtime:
 *
 *   - `schechter` — the LF triple `(M*, α, φ*)` for the band that defines
 *     the survey's flux limit (SDSS r-band, 2MRS K-band, GLADE B-band, …).
 *   - `mLim` — the survey's apparent-magnitude flux limit (e.g. SDSS = 17.77).
 *   - `nRef` — the central-density normaliser
 *     `expectedNumberDensity({...schechter, mLim, dMpc: 10})`, the
 *     reference-point density at d = 10 Mpc.
 *
 * Pre-Spec-E these were stored on `LoadedSource` inside `PointRenderer`,
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
 * so consumers can rely on `surveyConstants(source)` returning the
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

import { Source, ALL_SOURCES } from '../../data/sources';
import { surveyFluxLimit, surveySchechter } from '../../data/surveyFluxLimits';
import { expectedNumberDensity } from '../../utils/math/schechterDensity';
import type { SurveyConstants } from '../../@types/math/SurveyConstants';

// Type moved to `@types/math/SurveyConstants`; re-exported so existing
// `import { SurveyConstants } from './surveyConstants'` callers keep
// their import line.
export type { SurveyConstants };

function buildOne(source: Source): SurveyConstants {
  const schechter = surveySchechter(source);
  const mLim = surveyFluxLimit(source);
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
const TABLE: Record<Source, SurveyConstants> = ALL_SOURCES.reduce(
  (acc, src) => {
    acc[src] = Object.freeze(buildOne(src));
    return acc;
  },
  {} as Record<Source, SurveyConstants>,
);

/**
 * Look up the cached `SurveyConstants` for a source.  Identity-stable
 * across calls; safe to use as a Map key.
 */
export function surveyConstants(source: Source): SurveyConstants {
  return TABLE[source];
}
