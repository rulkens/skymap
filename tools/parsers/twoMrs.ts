/**
 * 2MASS Redshift Survey (2MRS) parser — VizieR catalog J/ApJS/199/26
 * (Huchra et al. 2012, ApJS 199, 26).
 *
 * Format: 233-byte fixed-width ASCII, 44,599 records. The full record
 * carries morphology codes, photometric uncertainties, redshift quality
 * flags, and bibliographic references; for rendering we only need seven
 * fields. The byte ranges below are 1-based inclusive (as published in
 * the ReadMe), and we slice them as `line.slice(N-1, M)` to convert into
 * JS's 0-based half-open indexing:
 *
 *   bytes 1-16    ID         2MASS designation (unused — objID stays 0n)
 *   bytes 18-26   RAdeg      decimal degrees, J2000
 *   bytes 28-36   DEdeg      decimal degrees, J2000
 *   bytes 58-63   Kcmag      extinction-corrected K, → magI
 *   bytes 65-70   Hcmag      extinction-corrected H, → magR
 *   bytes 72-77   Jcmag      extinction-corrected J, → magG (99.999 sentinel)
 *   bytes 174-178 cz         heliocentric velocity km/s, → z = cz / c
 *
 * ---
 * ### Why these particular fields, and why this mapping?
 *
 * 2MRS is fundamentally a near-IR redshift catalog — it has no optical
 * (u, g, r, i, z) photometry at all. To fit the renderer's canonical
 * `ParsedRecord` shape (which carries SDSS-style ugriz slots), we map
 * the three available 2MASS bands into the *closest* optical slots in
 * wavelength order: J (~1.25 µm) → magG, H (~1.65 µm) → magR,
 * K (~2.16 µm) → magI. The remaining magU and magZ stay NaN.
 *
 * The resulting "colour indices" are not SDSS u-r or g-r — they're 2MASS
 * J-K and H-K masquerading in those slots. That sounds dangerous, but the
 * renderer's K-correction shader keys off redshift only, and the
 * point-cloud colour ramp is driven by the source-tag (so 2MRS galaxies
 * get their own visual style). Storing the magnitudes in *some* slot,
 * even an imperfect one, is more useful than dropping them entirely:
 * downstream tools that compute apparent brightness or do flux-limit
 * histograms get sensible numbers.
 *
 * ---
 * ### Skip rules (rev-2)
 *
 * - **cz blank → skip.** A blank cz column means "no spectroscopic
 *   redshift was ever measured for this galaxy"; without z we can't
 *   place it in 3D space, so the row is useless to us. ~3% of 2MRS rows
 *   fall in this bucket.
 *
 * - **NEGATIVE cz is allowed.** This is the rev-2 fix. The first 2MRS
 *   row is M31 at cz = -300 km/s — its peculiar velocity (-300 km/s
 *   towards us) dominates the Hubble flow at its distance of ~700 kpc.
 *   Other Local Group members (M81, M33, NGC 6822, …) likewise have
 *   negative or near-zero cz. Earlier drafts of this parser dropped them
 *   as "z <= 0 must be a star or junk", which is the right rule for
 *   *cosmological* surveys like SDSS but wrong for nearby-galaxy
 *   catalogs like 2MRS. We use only `Number.isFinite(cz)` here — no
 *   positivity check.
 *
 * - **Kcmag or Hcmag non-finite → skip.** These two bands carry the
 *   2MRS flux limit and are present for essentially every row; a
 *   missing K or H signals the row was added for redshift bookkeeping
 *   but lacks usable photometry, which makes it un-renderable.
 *
 * - **Jcmag = 99.999 → store as NaN.** 2MRS uses 99.999 as a sentinel
 *   for "no J measurement available" (a small fraction of rows are K/H
 *   detections only). NaN propagates correctly through the renderer's
 *   colour computation, so this is just normal "missing band" behaviour.
 *
 * objID is always `0n` — 2MRS records have no SDSS counterpart by
 * definition; the merger uses 0n as the dedup-skip sentinel.
 */

import { Source } from '../../src/data/sources.js';
import { nonCommentLines, type ParsedRecord } from './common.js';

/**
 * Speed of light in km/s, used to convert heliocentric velocity cz into
 * dimensionless redshift z. We use the exact SI value (299,792.458 km/s)
 * so that round-tripping z↔cz is bit-identical with other tools that
 * cite the same constant.
 */
const C_KM_S = 299792.458;

/**
 * 2MRS' documented "no J-band measurement" sentinel. Recording it as a
 * named constant (rather than inlining `99.999` next to the comparison)
 * makes the magic number greppable and hard to mis-read as a magnitude.
 */
const J_MISSING_SENTINEL = 99.999;

/**
 * Minimum line length required for a row to even be considered. The cz
 * column ends at byte 178, so any line shorter than that has no chance
 * of carrying a valid redshift — and slicing past the end of a JS string
 * silently returns `''`, which then quietly parses as NaN. Bailing out
 * up front turns that silent failure into a loud, counted skip.
 */
const MIN_LINE_LEN = 178;

/**
 * Result of parsing a 2MRS catalog blob: the validated records plus a
 * count of rows we dropped. Surfacing `skipped` lets the build CLI print
 * it as a sanity check — for J/ApJS/199/26 we expect roughly 3% skips
 * (rows with blank cz); a much larger number means the file is corrupted
 * or we're parsing the wrong file format.
 */
export type TwoMrsResult = {
  records: ParsedRecord[];
  skipped: number;
};

/**
 * Parse a 2MRS table-3 blob (`data/raw/2mrs_table3.dat`) into canonical
 * records. See the module docstring for the byte layout, mapping rationale,
 * and skip rules.
 */
export function parseTwoMrs(rawText: string): TwoMrsResult {
  // `nonCommentLines` is overkill for a fixed-width binary-ish file
  // (the real 2MRS table has no comment lines at all) but using the
  // shared helper keeps the parser uniform with sdssCsv and gives us
  // free CRLF normalisation for free if anyone re-saves the file.
  const lines = nonCommentLines(rawText);

  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    if (line.length < MIN_LINE_LEN) {
      // A truncated line can't carry a cz value; count it as skipped
      // rather than letting the slice produce NaN further down.
      skipped++;
      continue;
    }

    // All field offsets are 1-based inclusive in the ReadMe; `slice(N-1, M)`
    // converts to JS's 0-based half-open form. Trim each cell because the
    // numeric fields are space-padded on the left in the source file.
    const ra = parseFloat(line.slice(17, 26).trim());
    const dec = parseFloat(line.slice(27, 36).trim());
    const kc = parseFloat(line.slice(57, 63).trim());
    const hc = parseFloat(line.slice(64, 70).trim());
    const jcRaw = parseFloat(line.slice(71, 77).trim());

    // cz needs explicit blank-string handling: `parseFloat('')` returns
    // NaN, which is what we want, but we keep the check separate so that
    // the *meaning* (no redshift measured) is visible at the call site.
    const czStr = line.slice(173, 178).trim();
    const cz = czStr === '' ? NaN : parseFloat(czStr);

    if (
      !Number.isFinite(ra) ||
      !Number.isFinite(dec) ||
      !Number.isFinite(kc) ||
      !Number.isFinite(hc) ||
      !Number.isFinite(cz)
    ) {
      // Note: we deliberately do NOT check `cz > 0` here. Local Group
      // galaxies have negative cz and are scientifically real — see the
      // rev-2 skip-rules block in the module docstring.
      skipped++;
      continue;
    }

    // Translate Jcmag's published sentinel to NaN so downstream consumers
    // can use the same "missing band" idiom regardless of which survey
    // the record came from.
    const jc = jcRaw === J_MISSING_SENTINEL ? NaN : jcRaw;

    records.push({
      source: Source.TwoMRS,
      objID: 0n,
      ra,
      dec,
      z: cz / C_KM_S,
      magU: NaN,
      magG: jc,
      magR: hc,
      magI: kc,
      magZ: NaN,
      // TODO Task 6 (galaxy-orientation-disks): cross-match the 2MASS
      // designation in bytes 1-16 against the 2MASS XSC `sup_phi` + `sup_ba`
      // shape catalog (fetched offline into data/raw/2mass_xsc_pa.csv) to
      // populate real axisRatio + PA. Until that cache is wired in, every
      // 2MRS row routes through fallbackOrientation.
      axisRatio: null,
      positionAngleDeg: null,
    });
  }

  return { records, skipped };
}
