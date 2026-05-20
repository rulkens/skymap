/**
 * Milliquas v8 (Million Quasars) parser — Flesch 2023, the compilation
 * AGN catalogue distributed as a single 188-character fixed-width text
 * file at <https://quasars.org/milliquas.htm>.
 *
 * The catalogue carries the literature's compiled positions, names,
 * optical R/B-band magnitudes, redshifts, citations, and optional
 * X-ray / radio identifiers for ~983k confirmed-and-candidate AGN —
 * QSOs, BL Lacs, type-1 Seyferts, narrow-line type-2s, K-class
 * candidates, and star-candidate contaminants. We parse the whole
 * file in one pass and emit a `ParsedRecord[]` plus parallel
 * `names`/`classes` sidecars for the build pipeline to consume.
 *
 * ---
 * ### Why reuse `GalaxyCatalog` v4 (with morphology slots zeroed)?
 *
 * The on-disk binary format is fixed at 64 bytes per record (see
 * `src/data/galaxyCatalogFormat.ts`), and includes slots for axisRatio,
 * positionAngleDeg, and diameterKpc that are only meaningful for
 * resolved galaxies. Quasars are unresolved point sources at the
 * angular resolution of any of the parent surveys — there is no
 * morphology to measure, so all three fields stay `null` here and the
 * build pipeline writes the format's "no measurement" sentinels for
 * the renderer to read.
 *
 * The alternative — forking a "v5 point-source" format — was rejected
 * because the saving (~30 MB across the full Milliquas tier) would
 * gzip out essentially completely on the R2 transport, while the
 * pipeline branching cost (a second decoder, a second tier dropdown
 * code path, a second renderer-side identity encoding) is permanent.
 * Storing zeros in three slots is the cheap, boring win.
 *
 * ---
 * ### Why the linear-Hubble approximation even though Milliquas reaches z ≳ 7?
 *
 * Every other parser in this project converts redshift → comoving
 * distance via `z * c / H0`, which is only accurate to a few percent
 * at z ≲ 0.5 and diverges hard above that. Milliquas's redshift
 * distribution extends to the SDSS-style high-z tail (z ≈ 7 for the
 * ULAS J1120+0641-class quasars), so storing them with the linear
 * mapping puts those rows much closer to the camera than their true
 * comoving distance.
 *
 * We keep the linear approximation anyway, for two reasons. First,
 * consistency: every other source in the renderer uses the same
 * mapping, and a mixed scheme would break the "all rows agree on
 * 1 Mpc = N world units" invariant the volumes pipeline relies on.
 * Second, this is a *display* renderer, not a cosmology tool — the
 * user is meant to read "this AGN is far away" off the spatial
 * cluster of high-z quasars, not measure its luminosity distance to
 * the nearest percent. Migrating off linear-Hubble is tracked as a
 * separate plan; until that lands, Milliquas plays by the same rules
 * as everyone else.
 *
 * ---
 * ### Skip rules (spec-z subset only)
 *
 * The "Z" column carries a mixture of literature spec-z values and
 * estimated photo-z values, with no per-row quality flag. The user
 * picked the "spec-z subset only" policy: reject rows that look like
 * estimated photo-z, keep everything that looks like a measurement.
 * The rules below detect photo-z by looking at the *raw 6-char Z
 * string* (before parseFloat normalises away the trailing zeros that
 * give estimated values away):
 *
 *  1. **z = 0 sentinel.** A small fraction of v8 rows (~20) carry the
 *     literal `" 0.000"` value. Distance is `z * c / H0`, so z = 0
 *     would collapse RA/Dec to the origin — exactly the same bug we
 *     already squashed in 2MRS. We use exact `=== 0` rather than
 *     `Math.abs(z) < ε` because spec-z values can legitimately be very
 *     small but positive, and rejecting them would over-fire.
 *
 *     Separately, ~9k rows have a *blank* Z field (no redshift on file
 *     at all). Those are caught by the up-front `Number.isFinite(z)`
 *     check below and counted under `skipped.zMissing`. Both are
 *     genuinely un-renderable; they just have different upstream
 *     provenance.
 *
 *  2. **`.X00` photo-z candidates.** ~52k rows have Z ending in two
 *     zeros (e.g. `1.700`, `2.300`). These are photo-z estimates
 *     rounded to 0.1 — a tell-tale pattern of a probabilistic
 *     classification rather than a spectroscopic measurement. We
 *     match the raw 6-char field with `/\.\d00\s*$/` (allowing for
 *     trailing whitespace) so genuine F6.3 spec-z values like
 *     `1.234` survive.
 *
 *  3. **`.XY0` Gaia DR3 QSOC photo-z.** ~17k rows have Z ending in a
 *     single zero AND Zcite = `GAIA3` (trimmed). These are Gaia DR3
 *     QSOC's photo-z estimates rounded to 0.01. The two-stage test —
 *     pattern AND citation — is necessary because plenty of genuine
 *     spec-z values from non-Gaia sources happen to end in zero
 *     (e.g. SDSS reports `1.230` as the literal spectroscopic
 *     measurement, not a rounded estimate). Rule 2 takes precedence:
 *     a row matching `.X00` is dropped as a generic photo-z
 *     candidate before this rule even gets a chance to fire.
 *
 * The accepted set is ~943k records out of the ~1.02M-line file.
 *
 * ---
 * ### Why classes and names are sidecars, not on `ParsedRecord`
 *
 * `ParsedRecord` is the shared shape that flows into the binary
 * encoder — every field on it becomes bytes in the on-disk format.
 * The Milliquas Name (up to 25 chars) and Type[0] classification
 * letter are cosmetic / display fields that the InfoCard reads from
 * a JSON sidecar at runtime, not from the .bin. Adding string slots
 * to `ParsedRecord` would force a format version bump (currently v4,
 * 64 bytes/galaxy) and propagate strings through every other
 * parser's record path for no rendering benefit.
 *
 * Returning them in parallel arrays — `records[i]`, `names[i]`,
 * `classes[i]` all describe the same record — keeps the binary path
 * lean and lets the build pipeline thread the sidecar through to the
 * JSON output without touching the `GalaxyCatalog` byte layout.
 */

import { Source } from '../../src/data/sources.js';
import { nonCommentLines, type ParsedRecord } from './common.js';

// ─── Byte ranges (1-based inclusive, as published in the upstream ReadMe) ──
//
// Naming each range as a `const` rather than inlining slice arithmetic
// makes the column boundaries grep-able and forces the comment-and-
// constant pair to stay in sync. JS conversion is `line.slice(N-1, M)`.

const RA_BYTES = [1, 11] as const;
const DEC_BYTES = [13, 23] as const;
const NAME_BYTES = [26, 50] as const;
const TYPE_BYTES = [52, 55] as const;
const RMAG_BYTES = [57, 61] as const;
const BMAG_BYTES = [63, 67] as const;
const Z_BYTES = [77, 82] as const;
const ZCITE_BYTES = [91, 96] as const;

/**
 * Total record length per upstream readme. The catalogue is space-
 * padded to exactly 188 chars per line + newline; anything shorter
 * has been truncated in transit and shouldn't be parsed at all.
 */
const MIN_LINE_LEN = 188;

/**
 * Citation string used by Milliquas for Gaia DR3 QSOC photo-z
 * estimates, after trimming the 6-char fixed-width field. Anchoring
 * this as a named constant (rather than inlining `'GAIA3'` next to
 * the regex check) keeps the magic string greppable and makes the
 * intent explicit at the call site.
 */
const ZCITE_GAIA_QSOC = 'GAIA3';

/**
 * Match a 6-char F6.3 Z field whose value is rounded to one decimal
 * place — i.e. the literal three trailing digits are `.X00`. We test
 * the *raw* field (before parseFloat) and allow trailing whitespace
 * because the published F6.3 width sometimes leaves a space pad at
 * the right edge for very short values.
 *
 * Why match on the raw string rather than reapplying the rounding
 * test after parseFloat? `parseFloat('1.700')` returns `1.7`, which
 * loses the "this row's source was sloppy enough to round to 0.1"
 * signal. The two-zero suffix is what flags the row as an estimate;
 * it has to be detected before any numeric normalisation.
 */
const PHOTO_Z_ROUNDED_TO_TENTH = /\.\d00\s*$/;

/**
 * Match a 6-char F6.3 Z field rounded to 0.01 — three decimal
 * places with the last being zero (e.g. `1.420`, `2.150`). Used in
 * conjunction with the Gaia-QSOC Zcite check; plenty of genuine
 * spec-z values from non-Gaia sources happen to land on `.XY0`, so
 * we never apply this pattern in isolation.
 */
const PHOTO_Z_ROUNDED_TO_HUNDREDTH = /\.\d\d0\s*$/;

/**
 * Result of a Milliquas parse. The three arrays are parallel — the
 * row at `records[i]` is described by `names[i]` and `classes[i]`.
 *
 * The `skipped` quad lets the build CLI print per-rule rejection
 * counts as a sanity check: against the real v8 file we expect
 * roughly 9 k zMissing, 20 zZero, 52 k photo-z candidates, and 17 k
 * GAIA3-QSOC rows. A much smaller number means a rule is silently
 * over-firing; a much larger one means a rule is silently under-
 * firing. Either way it's a build-time signal worth surfacing.
 */
export type MilliquasParseResult = {
  records: ParsedRecord[];
  /** Verbatim Name column (bytes 26-50), trailing whitespace stripped. */
  names: string[];
  /** First character of the Type column (`Q`/`A`/`B`/`K`/`N`/`S`). */
  classes: string[];
  skipped: {
    /** Z field blank or non-numeric (no redshift on file). */
    zMissing: number;
    /** Z field is literal `0.000` — the catalogue's zero-distance sentinel. */
    zZero: number;
    /** Z rounded to 0.1 (`.X00` pattern) — generic photo-z candidate. */
    photoZRounded: number;
    /** Z rounded to 0.01 with Zcite=GAIA3 — Gaia DR3 QSOC photo-z. */
    qsocRounded: number;
  };
};

/**
 * Parse a Milliquas v8 fixed-width blob into the canonical pre-merge
 * shape. See the module docstring for the byte layout, the format-
 * reuse rationale, and the spec-z-subset skip rules.
 *
 * The function is pure: same input bytes → same output records. No
 * IO, no globals, no time-of-day branches. That keeps it trivially
 * unit-testable from a tiny in-line fixture (see
 * `tests/parsers/milliquas.test.ts`) without spinning up the full
 * 194 MB upstream file.
 */
export function parseMilliquas(rawText: string): MilliquasParseResult {
  // `nonCommentLines` is overkill for a pure-data file (real Milliquas
  // has no comment lines), but using the shared helper gives us free
  // CRLF normalisation and a uniform call signature with the other
  // fixed-width parsers in this project.
  const lines = nonCommentLines(rawText);

  const records: ParsedRecord[] = [];
  const names: string[] = [];
  const classes: string[] = [];
  const skipped = { zMissing: 0, zZero: 0, photoZRounded: 0, qsocRounded: 0 };

  for (const line of lines) {
    if (line.length < MIN_LINE_LEN) {
      // A short line can't carry the Zcite column at bytes 91-96
      // (needed for the GAIA3-QSOC skip rule), so attempting to
      // parse it would silently get the wrong value. Skip rather
      // than count — the catalogue ships every line at exactly the
      // documented width, so this branch is purely defensive.
      continue;
    }

    // Slice each field with the 1-based-inclusive convention from the
    // upstream readme, converted to JS's 0-based half-open form. Trim
    // each cell because the F-format numeric fields are space-padded.
    const raStr = line.slice(RA_BYTES[0] - 1, RA_BYTES[1]).trim();
    const decStr = line.slice(DEC_BYTES[0] - 1, DEC_BYTES[1]).trim();
    const nameRaw = line.slice(NAME_BYTES[0] - 1, NAME_BYTES[1]);
    const typeRaw = line.slice(TYPE_BYTES[0] - 1, TYPE_BYTES[1]);
    const rmagStr = line.slice(RMAG_BYTES[0] - 1, RMAG_BYTES[1]).trim();
    const bmagStr = line.slice(BMAG_BYTES[0] - 1, BMAG_BYTES[1]).trim();
    // Z and Zcite need their *raw* (untrimmed-right) form for the
    // photo-z pattern check; we trim explicitly when we want the
    // string-comparison or parseFloat-friendly variants below.
    const zRaw = line.slice(Z_BYTES[0] - 1, Z_BYTES[1]);
    const zciteRaw = line.slice(ZCITE_BYTES[0] - 1, ZCITE_BYTES[1]);
    const zciteTrimmed = zciteRaw.trim();

    const ra = parseFloat(raStr);
    const dec = parseFloat(decStr);
    const z = parseFloat(zRaw);

    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(z)) {
      // RA/Dec/Z are mandatory: without all three we can't place the
      // row in 3D space. In practice the only common cause is a blank
      // Z field — ~9 k rows in v8 carry valid coordinates but no
      // redshift on file. Truncated/corrupted lines would land here
      // too, but the catalogue ships every row complete, so the
      // overwhelming majority of hits are the no-redshift case.
      skipped.zMissing++;
      continue;
    }

    // ── Skip rule 1: exact z = 0 sentinel ────────────────────────────
    //
    // Same logic as 2MRS's cz=0 skip: distance = z * c / H0 collapses
    // to 0 for z = 0, which puts the row at the world origin. We use
    // exact `=== 0` rather than a tolerance check because real
    // spec-z values can legitimately be very small but positive
    // (z ≈ 0.001 is a Local Group AGN, not noise).
    if (z === 0) {
      skipped.zZero++;
      continue;
    }

    // ── Skip rule 2: .X00 photo-z candidates ─────────────────────────
    //
    // Match the raw 6-char Z field rather than re-rounding the
    // parseFloat'd value: `parseFloat('1.700')` → `1.7` loses the
    // trailing-zero tell, but the raw string preserves it. Allow
    // trailing whitespace because the F6.3 field is right-padded for
    // very-short literal values like `0.5  `.
    if (PHOTO_Z_ROUNDED_TO_TENTH.test(zRaw)) {
      skipped.photoZRounded++;
      continue;
    }

    // ── Skip rule 3: Gaia DR3 QSOC photo-z (.XY0 AND Zcite=GAIA3) ────
    //
    // Order matters: rule 2 (`.X00`) takes precedence — a row matching
    // both should be counted as a generic photo-z candidate, not a
    // GAIA3 row, because the `.X00` shape is the stronger signal.
    // This branch only ever sees rows that already survived rule 2.
    if (
      PHOTO_Z_ROUNDED_TO_HUNDREDTH.test(zRaw) &&
      zciteTrimmed === ZCITE_GAIA_QSOC
    ) {
      skipped.qsocRounded++;
      continue;
    }

    // ── Photometry: Rmag/Bmag, both possibly blank ────────────────────
    //
    // The catalogue uses a blank F5.2 field (five spaces) to mean
    // "this band has no measurement". We mirror 2MRS's "missing band
    // ↦ NaN" idiom rather than rejecting the row: a quasar with only
    // R-band photometry is still scientifically useful, and the
    // renderer's colour-index helper short-circuits to the neutral
    // ramp position for NaN bands.
    const magR = rmagStr === '' ? NaN : parseFloat(rmagStr);
    const magG = bmagStr === '' ? NaN : parseFloat(bmagStr);

    // The classification letter is the first non-space character of
    // the Type column (one of Q/A/B/K/N/S in practice). The
    // remaining 3 chars are association flags (R/X/2) that we drop
    // here — they're recoverable from the X-ray and radio ID columns
    // (98-119, 121-142) if a future pass needs them.
    const cls = typeRaw[0] ?? '';

    records.push({
      source: Source.Milliquas,
      // 0n: Milliquas rows have no SDSS objID by definition. Plenty
      // of rows reference SDSS internally (e.g. "SDSS J100022.5+023521"
      // names), but those are human-readable IDs, not the 19-digit
      // numeric SDSS objIDs the merger uses for dedup. The 0n
      // sentinel tells the merger to skip the dedup pass for this
      // record — exactly the behaviour we want, since Milliquas is
      // pre-deduplicated upstream against every parent survey.
      objID: 0n,
      ra,
      dec,
      z,
      // QSOs have only red and blue optical photometry in Milliquas:
      // Rmag → magR (closest SDSS band by wavelength), Bmag → magG
      // (the slot Milliquas's parent SDSS would have filled with
      // g-band). The remaining u/i/z slots stay NaN — the renderer's
      // band-aware colour code already handles missing slots.
      magU: NaN,
      magG,
      magR,
      magI: NaN,
      magZ: NaN,
      // Three nulls in a row: quasars are point sources at the
      // angular resolution of every parent survey. There is no
      // morphology to measure, so the renderer's deterministic-
      // fallback orientation will spin a generic disk visual for
      // each — which is wrong but consistent, and a Milliquas-
      // specific "point sprite" rendering is a separate plan.
      axisRatio: null,
      positionAngleDeg: null,
      diameterKpc: null,
    });
    names.push(nameRaw.trimEnd());
    classes.push(cls);
  }

  return { records, names, classes, skipped };
}
