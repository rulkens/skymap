/**
 * Survey constants table — table-vs-live-call round-trip.
 *
 * The table caches three pure-functions-of-Source values (Schechter
 * triple, flux limit, central-density normaliser) so the bias-correction
 * subsystem can look them up without re-running `expectedNumberDensity`
 * per call.  This test asserts that for every Source, the table's
 * `nRef` matches a live `expectedNumberDensity({...})` call — i.e.
 * the table didn't silently de-sync from the primitive helpers it
 * caches.
 */

import { describe, it, expect } from 'vitest';
import { surveyConstants } from '../../../src/services/biasCorrection/surveyConstants';
import { surveyFluxLimit, surveySchechter } from '../../../src/data/surveyFluxLimits';
import { expectedNumberDensity } from '../../../src/utils/math/schechterDensity';
import { Source } from '../../../src/data/sources';
import type { SurveySource } from '../../../src/@types/data/SurveySource';

// Reverse-lookup name from a Source value.  TS's old numeric enum
// auto-generated this map; the `as const` replacement does not, so we
// derive it locally for the test labels below. Keyed by `SurveySource`
// — POI codes (Cluster/Supercluster/Void) have no flux limit or
// Schechter triple, so this test never iterates them.
const SOURCE_NAME: Record<SurveySource, string> = {
  [Source.Synthetic]: 'Synthetic',
  [Source.SDSS]: 'SDSS',
  [Source.TwoMRS]: 'TwoMRS',
  [Source.Glade]: 'Glade',
  [Source.Famous]: 'Famous',
  [Source.Milliquas]: 'Milliquas',
};

describe('surveyConstants table', () => {
  for (const src of [
    Source.Synthetic,
    Source.SDSS,
    Source.TwoMRS,
    Source.Glade,
    Source.Famous,
  ]) {
    it(`Source.${SOURCE_NAME[src]} — schechter, mLim, nRef match live primitives`, () => {
      const c = surveyConstants(src);
      expect(c.schechter).toEqual(surveySchechter(src));
      expect(c.mLim).toBe(surveyFluxLimit(src));
      const liveNRef = expectedNumberDensity({
        ...surveySchechter(src),
        mLim: surveyFluxLimit(src),
        dMpc: 10,
      });
      // Table value must match the live computation byte-for-byte —
      // both go through the same `expectedNumberDensity` helper, so
      // any divergence would be a memoisation bug, not a precision
      // artefact.
      expect(c.nRef).toBe(liveNRef);
    });
  }

  it('returns the same object across calls (eager-build identity is stable)', () => {
    // Eager-built table: identity should be stable across calls so
    // consumers can use it as a cheap cache key without copying.
    const a = surveyConstants(Source.SDSS);
    const b = surveyConstants(Source.SDSS);
    expect(a).toBe(b);
  });
});
