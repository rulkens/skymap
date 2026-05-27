/**
 * Shared types for catalog parsers.
 *
 * Each survey we ingest (SDSS, 2MRS, 2MPZ, 6dFGS, …) ships its data in a
 * subtly different CSV/TSV/FITS layout, with different column names and
 * different sets of available photometric bands. Rather than letting every
 * parser bake out its own bespoke object shape, they all converge on a
 * single canonical pre-merge representation: `ParsedRecord`.
 *
 * The pipeline is therefore:
 *
 *   raw bytes  →  parser(survey-specific)  →  ParsedRecord[]  →  merge/dedup  →  .bin
 *
 * Keeping a flat `ParsedRecord[]` between "parse" and "merge" buys us two
 * things that streaming straight to the binary writer would not:
 *
 *  1. Cross-survey deduplication. The merger (in the future
 *     `tools/buildAllBins.ts`) needs to compare *every record from every
 *     survey* — e.g. "is this 2MPZ row also in SDSS via its SDSS_OBJID
 *     cross-ID?". That comparison only makes sense once all parsers have
 *     produced their full record arrays.
 *
 *  2. Source-priority ordering. Different surveys win for different
 *     regions of sky; the merger applies that priority on top of the
 *     deduped union. Doing it post-parse keeps each parser dumb and
 *     focused on one job (decode bytes → records).
 *
 * SDSS catalogs are ~500k rows; 2MPZ is ~1M; 6dFGS is ~125k; 2MRS is
 * ~45k. Holding them all in memory as flat objects costs only tens of MB,
 * which is trivial for an offline build tool — well worth it for the
 * algorithmic clarity.
 *
 * ---
 * ### Why NaN / 0n sentinels instead of `undefined` or `null`?
 *
 * Every consumer downstream of the parsers is numeric: the merger compares
 * magnitudes, the encoder packs them into typed arrays, the renderer
 * uploads them to the GPU as `f32`s. If a field were `undefined` we'd have
 * to litter the rest of the pipeline with `?? NaN` fallbacks, *and* every
 * field access would force TS to narrow `number | undefined` → `number`.
 *
 * `NaN` is the natural "missing-value" sentinel for IEEE-754 floats:
 *  - `NaN !== NaN`, so accidental equality bugs are loud, not silent.
 *  - It propagates through arithmetic — any computation that touches an
 *    unknown magnitude produces NaN, which the renderer can detect.
 *  - It survives the typed-array round-trip (Float32Array of NaN ≡ NaN).
 *
 * For `objID` we use `0n` because SDSS itself reserves objID 0 as the
 * "no object" sentinel, so it can never collide with a real ID. Using
 * `bigint | undefined` would force every consumer to handle the absent
 * case, even though "missing objID" is identical in meaning to
 * "this record came from a survey that doesn't carry SDSS IDs".
 */

import { Source } from '../../src/data/sources.js';
import type { SourceType } from '../../src/@types/data/SourceType';

export type ParsedRecord = {
  source: SourceType;
  /**
   * Numeric SDSS objID when known (SDSS rows always have one; some 2MPZ
   * rows include an `SDSS_OBJID` cross-ID column). 0n means "no SDSS
   * cross-ID for this record" — used by the merger's dedup pass to skip
   * records that have no anchor against the SDSS catalog.
   */
  objID: bigint;
  ra: number; // degrees, J2000
  dec: number; // degrees, J2000
  z: number; // redshift (spectroscopic or photometric depending on survey)
  /**
   * Five-band apparent magnitudes in the SDSS *ugriz* photometric system.
   * NaN means the survey does not provide that band (e.g. 2MRS only has
   * near-IR JHK photometry, so all five SDSS bands are NaN for 2MRS rows).
   * The merger may later fill some of these in by cross-matching, but the
   * parser's job is just to honestly report what its own catalog carries.
   */
  magU: number;
  magG: number;
  magR: number;
  magI: number;
  magZ: number;
  /**
   * Galaxy minor/major axis ratio b/a, in (0, 1]. `null` means the parser
   * couldn't extract a real measurement from this row — the build pipeline
   * will fill in a deterministic fallback (see fallbackOrientation.ts) before
   * encoding the cloud, and stamp the provenance flag accordingly.
   *
   * Why `number | null` rather than `number` with a NaN sentinel? Unlike the
   * five-band magnitudes — which fan out into many "missing band" code paths
   * across surveys and benefit from NaN-arithmetic propagation — orientation
   * has exactly two states: "real measurement" or "needs fallback". An
   * explicit `null` makes the build pipeline's branch (`if (r.axisRatio !==
   * null)`) read as a true binary decision instead of a NaN-sniffing test,
   * and TypeScript's narrowing forces every call site to handle the absent
   * case before assigning to the renderer's Float32Array slot.
   */
  axisRatio: number | null;
  /**
   * Galaxy position angle in degrees, [0, 180). PA is measured east of north
   * (standard astronomical convention). `null` follows the same "no real
   * measurement" semantics as axisRatio above.
   *
   * The two fields always travel together: a record either has both or
   * neither. They're typed independently rather than as a single
   * `orientation: { axisRatio; pa } | null` because the per-survey parsers
   * occasionally have to re-merge them from different upstream tables (e.g.
   * GLADE's HyperLEDA join supplies PA and logr25 separately), and keeping
   * them as flat fields lets each parser fill them in whichever order its
   * source data permits.
   */
  positionAngleDeg: number | null;
  /**
   * Physical diameter in kiloparsecs derived from this row's catalog.
   *
   *   - 2MRS  → 2 · 10^Riso · arcsecToKpc(1, distance_Mpc)  (real isophotal)
   *   - GLADE → Tully(1988) on absolute B mag derived from Bmag + distance
   *   - SDSS  → 3 · petroR50_r · arcsecToKpc(1, distance_Mpc)  (Petrosian)
   *
   * `null` means the parser couldn't extract a real measurement — the
   * build pipeline applies `DEFAULT_GALAXY_DIAMETER_KPC = 30` before
   * encoding, so the renderer always sees a finite value.  `null` over
   * NaN keeps the "we have a measurement vs we don't" decision a true
   * binary at the parser→pipeline boundary, mirroring how the orientation
   * fields handle the same kind of "real or fallback" distinction.
   */
  diameterKpc: number | null;
  /**
   * Per-source classification byte (see `src/data/sourceClass.ts`
   * for the per-source lookup tables).
   *
   * Defaults to `0` ("unknown / unclassified") for every parser
   * that doesn't carry a class signal — the build encoder writes
   * the byte straight through to the .bin's per-record `classByte`
   * slot.  Today only the Milliquas parser populates this field
   * (AGN class letter Q/A/B/K/N/S → enum 1..6); SDSS / 2MRS /
   * GLADE / Famous all leave it at 0.
   *
   * Why a flat byte rather than a tagged union per source?  The
   * on-disk format already commits to one byte per record (see
   * `src/data/galaxyCatalogFormat.ts` v5).  The build pipeline
   * never inspects the value — it just copies — so the parser is
   * the one place that knows how to translate its survey's class
   * signal into the byte, and a flat numeric field keeps the
   * pipeline blissfully ignorant of per-source semantics.
   */
  classByte: number;

  /**
   * Milliquas-only parent-survey enum byte (see
   * `milliquasParentSurveyPrefix` in `src/data/sourceClass.ts`).
   *
   * Every parser other than Milliquas leaves this at `0` (the
   * "no parent-survey prefix" sentinel).  The Milliquas parser
   * matches the Name column against the small fixed prefix set
   * (`SDSS`, `2MASX`, `GAIA`, `WISEA`, `NVSS`, `FIRST`, `6dFGS`)
   * and writes the matching enum value here so the runtime can
   * reconstruct `"<PARENT> J<RA><Dec>"` at hover time without a
   * companion JSON sidecar.
   *
   * Same plain-number-rather-than-tagged-union rationale as
   * `classByte`: the field is one byte at the binary boundary, and
   * the pipeline carries it through opaque.
   */
  parentSurveyByte: number;
  /**
   * 2MASS XSC designation, e.g. `00473313-2517196` (16 chars, no `2MASX J`
   * prefix — both 2MRS and GLADE spell it the same way at this layer).
   *
   * Populated only by the 2MRS parser today.  The build pipeline uses it
   * to join against a `2MASX → PGC` map harvested from GLADE's source
   * rows, so 2MRS records that lack a native PGC can still be routed
   * through NED's `?objname=PGC+<n>` direct-hit URL instead of a fuzzy
   * near-position search.
   *
   * Marked optional + transient: it's not part of the runtime
   * `GalaxyCatalog` binary format, and parsers that have no use for it
   * (SDSS, GLADE) simply don't set the field.  The build pipeline reads
   * it once during the 2MRS post-processing pass, then drops it on the
   * floor when it materialises records into the SoA cloud.
   */
  massId?: string;
};

/**
 * Strip blank lines and comment lines from a raw CSV blob, returning the
 * non-empty trimmed rows in order.
 *
 * We treat three kinds of lines as comments:
 *  - Blank / whitespace-only lines — usually trailing newlines or stray
 *    blanks between header and body.
 *  - Lines starting with `#` — SDSS SkyServer's CSV exports begin with a
 *    `#Table1` banner above the column header.
 *  - Lines starting with `--` — when the SQL query itself has a leading
 *    SQL comment, some export paths preserve it on the first line.
 *
 * The returned array still includes the header row as element 0; callers
 * are responsible for splitting header from body.
 *
 * Why is this in `common.ts`? All five surveys we plan to ingest deliver
 * line-oriented text with similar comment conventions, so deduplicating
 * the comment-stripping logic here means each individual parser focuses
 * on its own column quirks, not on input plumbing.
 */
export function nonCommentLines(rawText: string): string[] {
  return rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t !== '' && !t.startsWith('#') && !t.startsWith('--');
    });
}
