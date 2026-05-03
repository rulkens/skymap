/**
 * 2MRS catalogue parser.
 *
 * Turns a raw 2MASS Redshift Survey ASCII catalogue blob into an array of
 * canonical `ParsedRecord`s (see `common.ts`). Like the SDSS parser, this
 * module knows nothing about file I/O or downstream merging — it just decodes
 * one specific catalogue layout so the future `buildAllBins.ts` tool can
 * combine 2MRS records with the other surveys.
 *
 * ---
 * ### Catalogue source & format
 *
 * The 2MASS Redshift Survey (Huchra et al. 2012) is published as VizieR
 * catalogue VII/265. Unlike SDSS's CSV exports, VizieR ships 2MRS as
 * **fixed-width ASCII**: every column lives at known byte positions on
 * each line, with whitespace padding rather than commas as separators.
 *
 * The columns we extract (1-based byte ranges, inclusive on both ends —
 * matching VizieR's own ReadMe convention):
 *
 *   1–17    2MASS designation (e.g. "12345678+1234567")  — *not stored*
 *   19–28   RA (decimal degrees, J2000)
 *   30–39   Dec (decimal degrees, J2000)
 *   41–46   J magnitude (2MASS near-IR, ~1.25 µm)
 *   48–53   H magnitude (2MASS near-IR, ~1.65 µm)
 *   55–60   K_s magnitude (2MASS near-IR, ~2.17 µm)
 *   137+    cz (heliocentric recession velocity, km/s) — VizieR right-pads
 *           the field to the end of the record, so the column has no fixed
 *           end position; we read from byte 137 to end of line.
 *
 * Our string slices use the wider window `line.slice(N, M+1)` rather than
 * the textbook `line.slice(N-1, M)`. The reason: each documented column
 * ends at byte M but the *value itself* is right-aligned and may extend
 * into byte M+1 by one digit when the catalogue has been re-flowed for
 * extra precision (the published catalogue includes 6 fractional digits
 * for RA/Dec and 3 for the magnitudes, but some downloaders pad to the
 * next column's start). Reading one byte further captures any such
 * extension; the trailing whitespace separator is stripped by `.trim()`
 * before `parseFloat`, so this never accidentally pulls in the next
 * column's leading character.
 *
 * ---
 * ### Why we throw away the 2MASS designation
 *
 * `ParsedRecord.objID` is specifically a *numeric SDSS objID* — see the
 * comment in `common.ts`. The 2MASS designation is a string of the form
 * `HHMMSSss±DDMMSSs`, not an SDSS ID, so we always set `objID = 0n` for
 * 2MRS records to mark them as "no SDSS cross-ID". The merger uses that
 * sentinel to know it must fall back to angular cross-matching (RA/Dec
 * within a tolerance) rather than ID lookup when checking for duplicates.
 *
 * ---
 * ### Magnitude band mapping (JHK → ugriz slots)
 *
 * 2MRS only carries near-IR JHK photometry; SDSS only carries optical
 * ugriz photometry. The two are physically different bands — you can't
 * just pretend J is the same as g. But the renderer only has five
 * magnitude slots per point (matching the SDSS-shaped binary format), so
 * we have to pick *some* mapping rather than throw away the JHK numbers.
 *
 * The convention used here:
 *
 *   magU ← NaN  (no UV-blue band in 2MASS)
 *   magG ← J     (closest "blue" 2MASS band, conventionally listed first)
 *   magR ← H
 *   magI ← K     (closest "red" 2MASS band, conventionally listed last)
 *   magZ ← NaN  (no extra red band beyond K)
 *
 * The NaNs flag the absence honestly, so any consumer that wants to
 * compute a colour like `magG - magR` will get a meaningful J−H near-IR
 * colour out, while a request for `magU - magG` will short-circuit to
 * NaN (per IEEE-754) and the renderer can detect & handle it. The merger
 * will later fill in real ugriz values for any 2MRS record that has an
 * SDSS counterpart, replacing this fallback mapping.
 *
 * ---
 * ### Skip rules
 *
 * A row is skipped (counted in `result.skipped`) when:
 *  - `cz <= 0` — a non-positive heliocentric velocity means either no
 *    redshift was measured (catalogue missing-value sentinel of 0) or
 *    the galaxy is blueshifted (a foreground object inside the Local
 *    Group, not usefully placeable in cosmological distance space).
 *  - Any of J, H, K is blank or non-finite — without all three near-IR
 *    bands we can't compute meaningful colours, and a missing magnitude
 *    in 2MRS is rare enough that dropping the row is the safe default.
 *
 * RA and Dec are *not* checked separately: VizieR populates them on every
 * row in this catalogue, so a NaN there would indicate file corruption
 * and we'd rather see it propagate than be silently masked.
 */

import { Source } from '../../src/data/sources.js';
import { nonCommentLines, type ParsedRecord } from './common.js';

/**
 * Speed of light in km/s — used to convert the catalogue's heliocentric
 * recession velocity `cz` (km/s) into a dimensionless redshift `z`.
 *
 * `z = cz / c`. This is the *low-redshift* approximation, valid for
 * z ≲ 0.1 where the relativistic correction is below 1%. 2MRS is by
 * design a shallow survey (z_max ≈ 0.06), so the approximation is
 * comfortably within its accuracy budget — using the full relativistic
 * formula would change distances by less than the photometric noise.
 *
 * The constant is the IAU 2015 nominal value, kept full-precision so the
 * conversion is bit-identical across runs and platforms.
 */
const C_KM_S = 299792.458;

/**
 * Result of parsing a 2MRS file: the validated records plus a count of
 * rows dropped on the floor. We surface `skipped` separately so the CLI
 * can print it as a sanity check — a sudden jump in skipped rows usually
 * signals the input file was truncated or replaced with a different
 * catalogue version (column positions may have shifted).
 */
export type TwoMrsResult = {
  records: ParsedRecord[];
  skipped: number;
};

/**
 * Parse a 2MRS fixed-width ASCII blob into canonical records.
 *
 * Note on `nonCommentLines`: it strips lines starting with `#` or `--`
 * after trimming. Real 2MRS data lines always start with the first digit
 * of the 16-char 2MASS designation (e.g. `12345678+1234567`), so they
 * are never mistaken for comments — the helper safely strips any header
 * banners or stray blank lines without touching real rows.
 */
export function parseTwoMrs(rawText: string): TwoMrsResult {
  const lines = nonCommentLines(rawText);

  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    // Fixed-width slicing — see the module docstring for the windowing
    // convention. Each `.trim()` strips the right-aligned padding and the
    // (possibly absent) inter-column separator, so `parseFloat` sees a
    // clean numeric token or an empty string (→ NaN, filtered below).
    const ra = parseFloat(line.slice(19, 29).trim());
    const dec = parseFloat(line.slice(30, 40).trim());
    const magJ = parseFloat(line.slice(41, 47).trim());
    const magH = parseFloat(line.slice(48, 54).trim());
    const magK = parseFloat(line.slice(55, 61).trim());
    // cz uses an open-ended slice (no second argument) because VizieR
    // right-pads it to the end of the record rather than to a fixed
    // column — see the module docstring for the catalogue convention.
    const cz = parseFloat(line.slice(136).trim());

    // The skip rules in one combined check: cz must be strictly positive
    // (non-positive means missing or blueshifted), and all three near-IR
    // magnitudes must be finite. `Number.isFinite` rejects both NaN
    // (from blank/garbage parses) and ±Infinity (defensive — shouldn't
    // appear in a well-formed catalogue but cheap to guard against).
    if (cz <= 0 || !Number.isFinite(magJ) || !Number.isFinite(magH) || !Number.isFinite(magK)) {
      skipped++;
      continue;
    }

    records.push({
      source: Source.TwoMRS,
      // 2MRS rows have no SDSS objID; `0n` is the documented "no SDSS
      // cross-ID" sentinel that the merger recognises.
      objID: 0n,
      ra,
      dec,
      z: cz / C_KM_S,
      // JHK → ugriz slot mapping (see module docstring for rationale).
      magU: NaN,
      magG: magJ,
      magR: magH,
      magI: magK,
      magZ: NaN,
    });
  }

  return { records, skipped };
}
