/**
 * Galaxy catalog constants table — table-vs-live-call round-trip.
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
import { galaxyCatalogConstants } from '../../../src/services/biasCorrection/galaxyCatalogConstants';
import {
  galaxyCatalogFluxLimit,
  galaxyCatalogSchechter,
} from '../../../src/data/galaxyCatalog/galaxyCatalogFluxLimits';
import { expectedNumberDensity } from '../../../src/utils/math/expectedNumberDensity';
import { Source } from '../../../src/data/sources';
import type { GalaxyCatalogSourceType } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogSourceType';

// Reverse-lookup name from a Source value.  TS's old numeric enum
// auto-generated this map; the `as const` replacement does not, so we
// derive it locally for the test labels below. Keyed by `GalaxyCatalogSourceType`
// — structure codes (Cluster/Supercluster/Void) have no flux limit or
// Schechter triple, so this test never iterates them.
const SOURCE_NAME: Record<GalaxyCatalogSourceType, string> = {
  [Source.Synthetic]: 'Synthetic',
  [Source.SDSS]: 'SDSS',
  [Source.TwoMRS]: 'TwoMRS',
  [Source.Glade]: 'Glade',
  [Source.FamousGalaxy]: 'Famous',
  [Source.Milliquas]: 'Milliquas',
  [Source.DesiDeep]: 'DesiDeep',
  [Source.DesiWedge]: 'DesiWedge',
  [Source.DesiSgw]: 'DesiSgw',
  [Source.DesiSgwShape]: 'DesiSgwShape',
};

describe('galaxyCatalogConstants table', () => {
  for (const src of [
    Source.Synthetic,
    Source.SDSS,
    Source.TwoMRS,
    Source.Glade,
    Source.FamousGalaxy,
  ]) {
    it(`Source.${SOURCE_NAME[src]} — schechter, mLim, nRef match live primitives`, () => {
      const c = galaxyCatalogConstants(src);
      expect(c.schechter).toEqual(galaxyCatalogSchechter(src));
      expect(c.mLim).toBe(galaxyCatalogFluxLimit(src));
      const liveNRef = expectedNumberDensity({
        ...galaxyCatalogSchechter(src),
        mLim: galaxyCatalogFluxLimit(src),
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
    const a = galaxyCatalogConstants(Source.SDSS);
    const b = galaxyCatalogConstants(Source.SDSS);
    expect(a).toBe(b);
  });
});
