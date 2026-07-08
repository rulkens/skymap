import { describe, it, expect } from 'vitest';
import type { SourceType } from '../src/@types/data/SourceType';

// Note: we import from `tools/catalog/crossMatch` rather than the documented
// `tools/catalog/buildAllBins` path because the latter pulls in `node:fs`/`node:url`,
// and the main `tsconfig.json` (which governs the test build) excludes
// `tools/` and does not register `@types/node`. `buildAllBins.ts` re-exports
// `crossMatch` from this same module, so the symbol is identical either way.
import { crossMatch } from '../tools/catalog/crossMatch';
import { Source } from '../src/data/sources';
import type { ParsedRecord } from '../tools/parsers/common';

/**
 * Helper that builds a ParsedRecord with sensible defaults.
 *
 * Why a helper? Each test below cares about only three fields — source, sky
 * position, redshift — but the canonical `ParsedRecord` shape carries five
 * photometric magnitudes too. Hard-coding the irrelevant fields once here
 * keeps each test focused on the cross-match behaviour under examination.
 *
 * NaN for the four bands the synthetic record doesn't pretend to carry is
 * the same sentinel the real parsers emit when a galaxy catalog lacks that band
 * (see common.ts), so the merger is exercised with realistic input.
 */
function rec(source: SourceType, ra: number, dec: number, z: number, objID = 0n): ParsedRecord {
  return {
    source,
    objID,
    ra,
    dec,
    z,
    spectroscopicZ: z,
    magU: NaN,
    magG: 18,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
    // Orientation fields are part of the canonical `ParsedRecord` shape from
    // the galaxy-orientation-disks plan. `null` mirrors what every parser
    // emits today (the build pipeline fills in a deterministic fallback
    // before the cloud is encoded); the merger doesn't read these fields,
    // so leaving them as null exercises the merger with realistic input.
    axisRatio: null,
    positionAngleDeg: null,
    // diameterKpc is null here for the same reason axisRatio/positionAngleDeg
    // are null: the build pipeline (not the parser) is responsible for
    // materialising the DEFAULT_GALAXY_DIAMETER_KPC = 30 fallback, so at the
    // parser→pipeline boundary the field is legitimately absent.
    // The cross-match logic doesn't read this field, so null exercises the
    // merger with realistic input.
    diameterKpc: null,
    // classByte / parentSurveyByte are zero for every non-Milliquas
    // source; the cross-match logic doesn't read them either.
    classByte: 0,
    parentSurveyByte: 0,
  };
}

describe('crossMatch', () => {
  // The dedup criterion is "<5 arcsec on the sky AND <1% relative redshift".
  // Both must match for a record to be considered a duplicate; the two tests
  // below pin down each half of that AND.
  it('rejects positional duplicates within 5 arcsec and Δz/(1+z) < 1%', () => {
    const out = crossMatch({
      sdss: [rec(Source.SDSS, 180, 0, 0.1)],
      // ~0.36 arcsec offset and ~0.05% relative redshift difference — well
      // within both tolerances, so this should be detected as a duplicate
      // and dropped in favour of the higher-priority SDSS record.
      twoMrs: [rec(Source.TwoMRS, 180.0001, 0, 0.10005)],
      glade: [],
      desiDeep: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(Source.SDSS);
  });

  it('keeps records that differ in z even at the same position', () => {
    // A foreground galaxy at z=0.1 and a background galaxy at z=0.5
    // happen to project onto the same line of sight. They are two real,
    // distinct objects in 3D — the redshift gate is precisely what stops
    // the dedup pass from collapsing them into one.
    const out = crossMatch({
      sdss: [rec(Source.SDSS, 180, 0, 0.1)],
      twoMrs: [],
      glade: [rec(Source.Glade, 180, 0, 0.5)],
      desiDeep: [],
    });
    expect(out).toHaveLength(2);
  });

  it('preserves SDSS > 2MRS > GLADE priority on positional dedup', () => {
    // No SDSS record this time. The 2MRS row should win over the GLADE
    // duplicate because the merger concatenates sources in priority order
    // and "first one through wins" — 2MRS is processed before GLADE.
    const out = crossMatch({
      sdss: [],
      twoMrs: [rec(Source.TwoMRS, 180, 0, 0.05)],
      glade: [rec(Source.Glade, 180.0001, 0, 0.05005)],
      desiDeep: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(Source.TwoMRS);
  });

  it('keeps galaxies that appear only in GLADE', () => {
    // GLADE-only galaxies are the bulk of the all-sky low-z sample. The
    // merger must not silently drop them just because no SDSS or 2MRS
    // counterpart exists.
    const out = crossMatch({
      sdss: [],
      twoMrs: [],
      glade: [rec(Source.Glade, 30, -25, 0.001), rec(Source.Glade, 200, -43, 0.001)],
      desiDeep: [],
    });
    expect(out).toHaveLength(2);
  });

  // DESI Deep is the lowest-priority input — concatenated last, so it can
  // only claim sky+z neighbourhoods nobody else already claimed. These
  // three tests pin down the three shapes that matter: dedup against a
  // higher-priority survey, finger-of-god preservation among DESI's own
  // rows, and the untouched-passthrough case.
  it('drops a DESI record within 5 arcsec and 1% z of an SDSS record (SDSS wins)', () => {
    const out = crossMatch({
      sdss: [rec(Source.SDSS, 180, 0, 0.1)],
      twoMrs: [],
      glade: [],
      // Same ~0.36 arcsec / ~0.05% offsets as the SDSS-vs-2MRS dedup test
      // above — well within both tolerances, so this DESI row is the
      // low-z BGS overlap the priority rule exists to collapse away.
      desiDeep: [rec(Source.DesiDeep, 180.0001, 0, 0.10005)],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(Source.SDSS);
  });

  it('keeps a DESI same-sightline pair when Δz is beyond tolerance (finger-of-god survives)', () => {
    // Two DESI rows at the identical sky position but z 0.07 vs 0.09:
    // |Δz|/(1+min(z)) = 0.02/1.07 ≈ 1.9%, past the 1% gate, so both are
    // real distinct cluster members rather than one row seen twice. This
    // is the exact behaviour the deep-cone source exists to exploit —
    // dense enough sampling that real fingers of god show up as several
    // close-but-distinct redshifts along one line of sight.
    const out = crossMatch({
      sdss: [],
      twoMrs: [],
      glade: [],
      desiDeep: [
        rec(Source.DesiDeep, 233.2, 32.3, 0.07),
        rec(Source.DesiDeep, 233.2, 32.3, 0.09),
      ],
    });
    expect(out).toHaveLength(2);
  });

  it('passes a DESI-only sky region through untouched', () => {
    // No other survey contributes anything at these positions — DESI rows
    // with no candidate match in the grid must survive exactly as parsed.
    const out = crossMatch({
      sdss: [],
      twoMrs: [],
      glade: [],
      desiDeep: [
        rec(Source.DesiDeep, 233.2, 32.3, 0.07),
        rec(Source.DesiDeep, 234.5, 31.1, 0.7),
      ],
    });
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.source === Source.DesiDeep)).toBe(true);
  });
});
