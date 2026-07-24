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
 * - **Kcmag or Hcmag missing → skip.** These two bands carry the
 *   2MRS flux limit and are present for essentially every row; a
 *   missing K or H signals the row was added for redshift bookkeeping
 *   but lacks usable photometry, which makes it un-renderable. "Missing"
 *   means non-finite OR outside `isPlausibleMagnitude`, since 2MRS spells
 *   absence as a number (99.999) rather than a blank.
 *
 * - **Implausible Jcmag → store as NaN.** 2MRS uses 99.999 as a sentinel
 *   for "no J measurement available" (a small fraction of rows are K/H
 *   detections only). NaN propagates correctly through the renderer's
 *   colour computation, so this is just normal "missing band" behaviour.
 *
 * objID is always `0n` — 2MRS records have no SDSS counterpart by
 * definition; the merger uses 0n as the dedup-skip sentinel.
 */

import { Source } from '../../src/data/sources';
import { nonCommentLines, type ParsedRecord } from './common';
import { arcsecToKpc } from '../../src/utils/math/arcsecToKpc';
import { isPlausibleMagnitude } from '../utils/math/isPlausibleMagnitude';

/**
 * Speed of light in km/s, used to convert heliocentric velocity cz into
 * dimensionless redshift z. We use the exact SI value (299,792.458 km/s)
 * so that round-tripping z↔cz is bit-identical with other tools that
 * cite the same constant.
 */
const C_KM_S = 299792.458;

/**
 * Minimum line length required for a row to even be considered. The cz
 * column ends at byte 178, so any line shorter than that has no chance
 * of carrying a valid redshift — and slicing past the end of a JS string
 * silently returns `''`, which then quietly parses as NaN. Bailing out
 * up front turns that silent failure into a loud, counted skip.
 */
const MIN_LINE_LEN = 178;

/**
 * Hubble constant in km/s/Mpc used to convert 2MRS heliocentric velocity
 * (cz, km/s) into a comoving distance (Mpc) for the diameter calculation.
 * 70 is the project-wide convention — same value used by the renderer's
 * raDecZToCartesian helper, so the diameter math agrees with the world
 * positions out of the box.
 */
const H0_KM_S_PER_MPC = 70;

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
 * Map from 2MASS designation (the 16-char string in bytes 1-16 of every
 * 2MRS fixed-width line) to the 2MASS XSC's `sup_phi` (super-coadd PA in
 * degrees) and `sup_ba` (super-coadd b/a axis ratio).
 *
 * The 2MRS catalog itself ships with neither a position angle nor a true
 * axis ratio; both have to come from the underlying 2MASS XSC, which we
 * pre-fetch into `data/raw/2mrs/2mass_xsc_pa.csv` (see `tools/fetch2massXsc.ts`).
 * Using a `Map` rather than, say, an `Object`/`Record<string, ...>` keeps
 * lookup O(1) for ~44k 2MRS rows × tens of thousands of XSC entries, and
 * sidesteps the prototype-pollution traps you get with key strings that
 * happen to look like `__proto__`.
 *
 * Exposing this as a *type alias* is deliberate: the build pipeline lives
 * in `buildAllBins.ts`, and we want `parseTwoMrs` to stay IO-free (and
 * therefore unit-testable) by having the caller construct the map and
 * pass it in. That keeps the parser's contract honest — given the same
 * input text and the same map, you always get the same records.
 */
export type XscShapeMap = Map<string, { sup_phi: number; sup_ba: number }>;

/**
 * Parse the cached 2MASS XSC shape CSV produced by `tools/fetch2massXsc.ts`
 * into the lookup map consumed by `parseTwoMrs`.
 *
 * The cache stores one row per 2MASS ID we *queried* — including IDs that
 * VizieR ultimately had no XSC entry for. Those misses appear as rows
 * with empty `sup_phi` / `sup_ba` cells, and we intentionally skip them
 * here (so `xsc.has(id)` correctly distinguishes "we have shape data" from
 * "we asked but came up empty"). The build pipeline's deterministic
 * fallback orientation handles the misses; storing them as a separate
 * "queried but empty" sentinel would only complicate the lookup site.
 *
 * Header row (`2massID,sup_phi,sup_ba`) is dropped via the `i = 1` start.
 * We don't validate the header column names — if `fetch2massXsc.ts`
 * changes its output schema, the resulting map will simply be empty and
 * Task 9's logging in `buildAllBins.ts` will catch it.
 */
export function parseXscShapeCsv(rawText: string): XscShapeMap {
  const out: XscShapeMap = new Map();
  const lines = rawText.split(/\r?\n/).filter((l) => l.length > 0);
  for (let i = 1; i < lines.length; i++) {
    const [id, sup_phi, sup_ba] = lines[i]!.split(',');
    if (!id) continue;
    const phi = parseFloat(sup_phi ?? '');
    const ba = parseFloat(sup_ba ?? '');
    // Both fields must be finite to count as a hit; a single missing cell
    // from the CSV (rare, but possible if the upstream XSC row was
    // partially populated) is treated the same as "no match" so callers
    // get the deterministic-fallback orientation rather than a NaN PA.
    if (Number.isFinite(phi) && Number.isFinite(ba)) {
      out.set(id.trim(), { sup_phi: phi, sup_ba: ba });
    }
  }
  return out;
}

/**
 * Parse a 2MRS table-3 blob (`data/raw/2mrs/2mrs_table3.dat`) into canonical
 * records. See the module docstring for the byte layout, mapping rationale,
 * and skip rules.
 *
 * The optional `xsc` map carries per-2MASS-ID shape data (PA + b/a) from
 * the 2MASS XSC. Every 2MRS row's 16-byte 2MASS designation is looked up
 * in the map; on a hit we populate `axisRatio` + `positionAngleDeg`
 * directly, and on a miss we leave both as `null` so the renderer's
 * deterministic-fallback orientation kicks in. Defaulting to an empty map
 * keeps the single-arg call form valid for tests and for the period
 * before Task 9 wires the real cache through `buildAllBins.ts`.
 */
export function parseTwoMrs(rawText: string, xsc: XscShapeMap = new Map()): TwoMrsResult {
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
    //
    // The 2MASS designation occupies bytes 1-16; we pull it eagerly so the
    // XSC lookup at the bottom of the loop can use it. Trimming makes the
    // map key match what `parseXscShapeCsv` stored (also trimmed), which
    // is important because the 2MRS file pads its ID column with spaces
    // for the rare rows where the designation is shorter than 16 chars.
    const massId = line.slice(0, 16).trim();
    const xscEntry = xsc.get(massId);

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

    // K and H are gated by `isPlausibleMagnitude` rather than plain
    // finiteness: 2MRS writes its "no measurement" sentinel as a number
    // (99.999), so a finiteness check alone would let a row with no usable
    // photometry through carrying a magnitude 88 mag off the sample limit.
    if (
      !Number.isFinite(ra) ||
      !Number.isFinite(dec) ||
      !isPlausibleMagnitude(kc) ||
      !isPlausibleMagnitude(hc) ||
      !Number.isFinite(cz)
    ) {
      // Note: we deliberately do NOT check `cz > 0` here. Local Group
      // galaxies have negative cz and are scientifically real — see the
      // rev-2 skip-rules block in the module docstring.
      skipped++;
      continue;
    }

    // ── Skip the cz=0 sentinel row ───────────────────────────────────────
    //
    // 2MRS contains a bookkeeping entry whose recession velocity is
    // literally `0` km/s.  Distance is `cz / H0`, so cz = 0 puts the
    // galaxy at distance = 0 — i.e. directly at the camera's home
    // position (the world origin).  RA/Dec don't matter when distance
    // is zero: the spherical-to-cartesian transform collapses to
    // (0, 0, 0) for any angular coordinate.  In practice this row was
    // appearing dead-centre on the map under the synthesised
    // designation `2MASX J000000.00+000000.0` (the runtime IAU-name
    // formatter sees the inverse-transform-from-origin output of
    // ra = 0, dec = 0 and emits the all-zero string), where it could
    // be mistaken for the Milky Way (which 2MRS does not — and could
    // not — catalogue).
    //
    // Why exact `=== 0` rather than `Math.abs(cz) < 1`:  every real
    // galaxy has *some* peculiar motion plus Hubble-flow recession
    // velocity, so a measured cz of exactly 0 is unphysical and almost
    // certainly a placeholder.  Negative cz IS real — Local Group
    // members like M31 have cz ≈ -300 km/s and we explicitly preserve
    // them (see the rev-2 skip-rules block in the module docstring).
    // The `cz === 0` predicate sits between those two cases and
    // catches the sentinel cleanly without dropping legitimate near-
    // zero-cz Local Group entries.
    //
    // The blank-cz path above doesn't catch this because the column
    // contains the literal string "    0", which `parseFloat` happily
    // turns into a finite zero.
    if (cz === 0) {
      skipped++;
      continue;
    }

    // Translate Jcmag's published sentinel (99.999) to NaN so downstream
    // consumers can use the same "missing band" idiom regardless of which
    // survey the record came from. The shared range predicate does that
    // without naming the constant: 99.999 is nowhere near a magnitude any
    // instrument reports, and matching the family rather than the exact
    // literal also catches a truncated `99.99` or a `-9999` inherited from
    // an upstream cross-match.
    const jc = isPlausibleMagnitude(jcRaw) ? jcRaw : NaN;

    // Riso (log10 of isophotal RADIUS in arcsec, K=20 mag/arcsec² isophote)
    // sits at bytes 142-146 (1-based inclusive, half-open 141..146).  About
    // 80 % of 2MRS rows carry it; the rest (mostly faint galaxies near the
    // K=11.75 sample limit where the isophote fits poorly) have it blank.
    // We treat blank/non-finite as "no measurement" and emit null — the
    // build pipeline applies DEFAULT_GALAXY_DIAMETER_KPC = 30 in that case.
    const risoStr = line.slice(141, 146).trim();
    const riso = risoStr === '' ? NaN : parseFloat(risoStr);
    // The angular major-axis diameter is a pure catalog fact — it does NOT
    // depend on cz, so we compute it whenever Riso is present, including for
    // blueshifted (cz < 0) rows. The build pipeline converts it to a physical
    // diameter against whatever distance it ultimately adopts (see
    // ParsedRecord.angularMajorAxisArcsec). The distance-baked `diameterKpc`
    // below stays cz-gated for backward compatibility with the cz > 0 path.
    const angularMajorAxisArcsec = Number.isFinite(riso) ? 2 * Math.pow(10, riso) : undefined;
    let diameterKpc: number | null = null;
    if (Number.isFinite(riso)) {
      const arcsecRadius = Math.pow(10, riso);
      const arcsecDiameter = 2 * arcsecRadius;
      const distanceMpc = cz / H0_KM_S_PER_MPC;
      // Local Group galaxies have negative cz — the resulting "negative
      // distance" is unphysical and would produce a nonsense diameter.
      // For those rows fall through to null and let the pipeline use the
      // 30 kpc default; the LG members M31/M33/etc are special-cased
      // enough that a real-distance lookup belongs in a future pass.
      if (distanceMpc > 0) {
        const kpc = arcsecToKpc(arcsecDiameter, distanceMpc);
        if (Number.isFinite(kpc) && kpc > 0) diameterKpc = kpc;
      }
    }

    records.push({
      source: Source.TwoMRS,
      objID: 0n,
      // Retain the 2MASS XSC designation transiently so the build
      // pipeline's PGC cross-match can patch a HyperLEDA PGC into the
      // objID slot above.  See ParsedRecord.massId for the full
      // motivation; this field is dropped before the cloud is encoded.
      massId,
      ra,
      dec,
      z: cz / C_KM_S,
      spectroscopicZ: cz / C_KM_S,
      magU: NaN,
      magG: jc,
      magR: hc,
      magI: kc,
      magZ: NaN,
      // axisRatio + positionAngleDeg come from the 2MASS XSC, not 2MRS
      // itself. On a hit we copy the XSC's super-coadd values directly; on
      // a miss (no entry, or this parser was called single-arg without a
      // map) both stay null and the renderer applies its deterministic
      // pseudorandom fallback orientation, keyed off objID/RA/Dec, so the
      // disk still has *some* tilt rather than facing the camera flat.
      axisRatio: xscEntry ? xscEntry.sup_ba : null,
      positionAngleDeg: xscEntry ? xscEntry.sup_phi : null,
      diameterKpc,
      angularMajorAxisArcsec,
      // 2MRS rows have no AGN class signal and no Milliquas
      // parent-survey prefix; both bytes stay 0.
      classByte: 0,
      parentSurveyByte: 0,
    });
  }

  return { records, skipped };
}
