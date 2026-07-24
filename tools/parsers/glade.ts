/**
 * GLADE v2.3 parser — VizieR catalog VII/281 (Dálya et al. 2018,
 * MNRAS 479, 2374).
 *
 * GLADE ("Galaxy List for the Advanced Detector Era") is a value-added
 * all-sky compilation cross-matched and pre-merged from five parent
 * catalogs:
 *
 *   - GWGC      Gravitational Wave Galaxy Catalogue (White+ 2011)
 *   - HyperLEDA spectroscopic / photometric galaxy database (Makarov+ 2014)
 *   - 2MASS XSC 2MASS Extended Source Catalogue
 *   - 2MPZ      2MASS Photometric Redshift Catalogue (Bilicki+ 2014)
 *   - SDSS-DR12 Quasar catalogue
 *
 * Why GLADE replaces the rev-1 standalone 2MPZ + 6dFGS sources: cross-match
 * dedup is *already done* by the GLADE team. If we ingested 2MPZ and 6dFGS
 * as separate sources we'd be carrying double-counted galaxies until we
 * re-implemented their dedup logic ourselves. By treating GLADE as a single
 * "deep all-sky baseline" source we get the science right out of the box,
 * and the renderer's UI shrinks from five toggles to three.
 *
 * We do still need to dedup GLADE rows against SDSS Main + BOSS at the
 * merge step — but that uses position+z tolerance, not numeric objID
 * matching, because GLADE's SDSS-DR12 column is a *name string* (e.g.
 * `J123456.78+901234.5`), not a numeric SDSS objID. That's why this parser
 * always emits `objID = 0n` (the merger's "no SDSS anchor" sentinel).
 *
 * ---
 * ### Format: 256-byte fixed-width ASCII, 3,262,881 records.
 *
 * The byte ranges below are 1-based inclusive (as published in the ReadMe);
 * we slice them with `line.slice(N-1, M)` to convert into JS's 0-based
 * half-open indexing. Only the fields the renderer actually consumes are
 * extracted — the ID columns (PGC, GWGC, HyperLEDA, 2MASS, SDSS-DR12)
 * are intentionally ignored because GLADE has no SDSS objID, and the
 * other names aren't yet used downstream.
 *
 *   bytes 104     Flag1   object type — `Q`=quasar, `C`=globular, `G`=galaxy
 *   bytes 106-123 RAdeg   decimal degrees, J2000
 *   bytes 125-144 DEdeg   decimal degrees, J2000
 *   bytes 174-191 z       redshift (sentinel `---` if absent)
 *   bytes 193-198 Bmag    apparent B mag (→ magG)
 *   bytes 215-220 Jmag    2MASS J (→ magR)
 *   bytes 228-233 Hmag    2MASS H (→ magI)
 *   bytes 241-246 Kmag    2MASS K (→ magZ)
 *   bytes 254     Flag2   distance source — `0` = neither z nor distance
 *
 * ---
 * ### Photometric mapping (heterogeneous → SDSS *ugriz* slots)
 *
 * GLADE's photometry is a patchwork: B is from various optical surveys
 * (often photographic plates via HyperLEDA), JHK are from 2MASS. The
 * canonical `ParsedRecord` carries five SDSS slots (u, g, r, i, z), so
 * fitting GLADE into that shape is procrustean. The mapping below puts
 * the bluest available band (B) into the bluest occupied slot (g) and
 * fills the longer-wavelength slots in order:
 *
 *   magU = NaN   (no u-band in GLADE)
 *   magG = Bmag  (apparent B, ~0.44 µm)
 *   magR = Jmag  (2MASS J, ~1.25 µm)
 *   magI = Hmag  (2MASS H, ~1.65 µm)
 *   magZ = Kmag  (2MASS K, ~2.16 µm)
 *
 * The resulting "colour indices" are not SDSS u-r or g-r; they're optical-B
 * vs near-IR-JHK masquerading in those slots. That sounds dangerous, but
 * the renderer's K-correction shader keys off redshift only, and the
 * point-cloud colour ramp is driven by the source-tag — so GLADE galaxies
 * get their own visual style and the magnitudes are useful for flux-limit
 * histograms and apparent-brightness sorting even if "colour" is loose.
 *
 * ---
 * ### Skip rules (rev-2)
 *
 * - **Flag1 != 'G' → skip.** Drops quasars (`Q`, point-like AGN) and
 *   globular clusters (`C`, bound stellar systems inside galaxies). The
 *   renderer's audience is "extragalactic galaxies", so non-galaxy rows
 *   would be misleading even though their photometry is valid.
 *
 * - **Flag2 == '0' → skip.** GLADE's own quality flag for "no measured z
 *   or distance attached to this row". Without z we can't place the row
 *   in 3D space; rendering it would put a phantom galaxy at distance 0.
 *
 * - **z parse fails or z ≤ 0 → skip.** Unlike 2MRS, GLADE deliberately
 *   excludes the local-group blueshift regime — its parent catalogs are
 *   cosmological-distance galaxy compilations (HyperLEDA's own dwarfs are
 *   the only edge case, and they tend to have z >= 0 anyway). The
 *   sentinel for "no redshift available" in this column is the dash
 *   string `---` (or `--`, or `-`), which `parseFloatOrNaN` handles.
 *
 * - **RA / Dec parse fails → skip.** Defensive — every real GLADE row
 *   has populated RA/Dec, but a corrupt download could short-line a row.
 *
 * objID is always `0n` — see the cross-match note above.
 */

import { Source } from '../../src/data/sources';
import { type ParsedRecord } from './common';
import { galaxyDiameterKpc } from '../../src/utils/math/galaxyDiameterKpc';
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../../src/utils/math/defaultGalaxyDiameterKpc';
import { absoluteMagnitude } from '../../src/utils/math/absoluteMagnitude';
import { redshiftToDistanceMpc } from '../../src/utils/math/redshiftToDistanceMpc';
import { isPlausibleMagnitude } from '../utils/math/isPlausibleMagnitude';

/**
 * Map from PGC string (no padding, no leading zeros stripped) to HyperLEDA's
 * `pa` (PA in degrees), derived `axisRatio = 10^(-logr25)`, and the
 * redshift-independent distance modulus + uncertainty.
 *
 * The GLADE ReadMe says PGC sits in bytes 1-7 (0-based: 0-7). HyperLEDA
 * stores the same identifier as a plain integer; we trim the GLADE field
 * to its non-space content to match.
 *
 * `mod0` / `e_mod0` are NaN when HyperLEDA has no redshift-independent
 * distance for the PGC (most rows). The CF4 → HyperLEDA distance fallback
 * (`tools/parsers/cosmicflows4.ts`, see local-volume-distances spec) uses
 * these to convert via `d_Mpc = 10^((mod0 - 25) / 5)` when CF4 misses.
 */
export type HyperLedaShapeMap = Map<
  string,
  { pa: number; axisRatio: number; mod0: number; e_mod0: number }
>;

const HYPERLEDA_CSV_HEADER_V2 = 'pgc,pa,logr25,logd25,e_logd25,mod0,e_mod0';

/**
 * Parse the cached HyperLEDA CSV produced by `tools/fetchHyperLeda.ts`.
 *
 * Cache rows with empty `pa` / `logr25` mean "we asked HyperLEDA, no match"
 * — those rows are intentionally absent from the returned map (the build
 * pipeline falls through to the deterministic fallback for them).
 *
 * A v1 cache (`pgc,pa,logr25,logd25,e_logd25`, no mod0 columns) is
 * rejected loudly rather than silently producing NaN distances — the
 * caller must delete the cache and re-run `npm run fetch-hyperleda`.
 */
export function parseHyperLedaCsv(rawText: string): HyperLedaShapeMap {
  const out: HyperLedaShapeMap = new Map();
  const lines = rawText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return out;
  const header = lines[0]!.trim();
  if (header !== HYPERLEDA_CSV_HEADER_V2) {
    throw new Error(
      `hyperleda CSV missing mod0/e_mod0 columns — delete data/raw/hyperleda_pa.csv and re-run fetchHyperLeda to upgrade the schema (expected '${HYPERLEDA_CSV_HEADER_V2}', got '${header}')`,
    );
  }
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(',');
    const pgc = cells[0];
    if (!pgc) continue;
    const paN = parseFloat(cells[1] ?? '');
    const lr = parseFloat(cells[2] ?? '');
    if (Number.isFinite(paN) && Number.isFinite(lr)) {
      // logr25 = log10(major/minor); axisRatio = minor/major = 10^(-logr25)
      const mod0 = parseFloat(cells[5] ?? '');
      const e_mod0 = parseFloat(cells[6] ?? '');
      out.set(pgc.trim(), {
        pa: paN,
        axisRatio: Math.pow(10, -lr),
        mod0,
        e_mod0,
      });
    }
  }
  return out;
}

/**
 * Result of parsing the GLADE catalog: validated records plus a count of
 * dropped rows. Surfacing `skipped` lets the build CLI report it as a
 * sanity check — for VII/281 a healthy run drops a few percent of rows
 * (mostly Flag1 != 'G' and Flag2 == '0'); a much larger number means
 * we're parsing the wrong file or the byte offsets have drifted.
 */
export type GladeResult = {
  records: ParsedRecord[];
  skipped: number;
};

/**
 * Minimum line length required for a row to be usable. Flag3 sits at byte
 * 256 (the very end of the record), and slicing past the end of a JS
 * string silently returns `''` which then quietly parses as NaN. Bailing
 * out up front turns that silent failure into a counted skip.
 */
const MIN_LINE_LEN = 256;

/**
 * Tolerant float parser that recognises GLADE's "missing value" sentinels.
 *
 * The VII/281 ReadMe documents the sentinel as `?=-`, but actual rows in
 * the data file use a *run* of dashes that fills the column width — so a
 * 6-byte field is `---   ` and a 4-byte one is `--`. Treating any
 * dash-only string (any length) as "missing" is therefore the correct
 * tolerant rule, matching what the catalog actually emits rather than
 * what the ReadMe literally says.
 *
 * Empty strings (the field was all spaces) are also missing. Any other
 * unparseable content collapses to NaN, which is the canonical
 * "missing-value" sentinel for downstream `ParsedRecord` magnitudes.
 *
 * This helper is *not* used for RA/Dec — those are guaranteed populated
 * by the catalog construction process, and treating a malformed RA as
 * NaN would mask a corrupted download with a quiet skip. RA/Dec use a
 * plain `parseFloat` + `Number.isFinite` check instead.
 */
function parseFloatOrNaN(s: string): number {
  const trimmed = s.trim();
  // Empty cell or any run of dashes (`-`, `--`, `---`, ...) is a sentinel.
  // The `^-+$` regex requires the *entire* trimmed string be dashes,
  // so a real negative number like `-0.001` is *not* matched.
  if (trimmed === '' || /^-+$/.test(trimmed)) return NaN;
  const v = parseFloat(trimmed);
  return Number.isFinite(v) ? v : NaN;
}

/**
 * Magnitude columns get a second gate on top of `parseFloatOrNaN`.
 *
 * GLADE is a compilation catalog: its photometry is copied verbatim from
 * HyperLEDA, 2MASS, SDSS and friends, each of which has its own numeric
 * "no measurement" sentinel (`-9999`, `99.99`, …). Any of those that
 * survives the dash check parses as a finite number and would then be
 * treated as a real, absurdly bright or absurdly faint galaxy. Routing the
 * four magnitude columns through `isPlausibleMagnitude` collapses the whole
 * family to NaN, the sentinel the rest of the pipeline already understands.
 * Redshift keeps the plain parser — it has its own positivity rule below.
 */
function parseMagOrNaN(s: string): number {
  const v = parseFloatOrNaN(s);
  return isPlausibleMagnitude(v) ? v : NaN;
}

/**
 * Options controlling row-level filtering of GLADE rows.
 *
 * `specZOnly`: when true, drop rows where the redshift is a 2MPZ photometric
 * estimate.  GLADE's `Flag2` byte alone can't tell us spec vs photo for
 * `Flag2 = '1'` (its dominant value) — that flag just says "the redshift was
 * the input from which distance was computed", regardless of whether the
 * redshift itself was measured by spectroscopy or by colour-fitting.
 *
 * Heuristic: a row is treated as spec-z when ANY of the following hold:
 *   - `Flag2 == '2'`: distance was directly measured (Tully-Fisher,
 *     Cepheid, etc.) — there's no photo-z error in the radial coordinate.
 *   - `Flag2 == '3'`: GLADE explicitly replaced an earlier photo-z with a
 *     spec-z that arrived later.  Definite spec-z.
 *   - `Flag2 == '1'` AND a name from a spec-z-dominated parent catalog is
 *     populated — GWGC, HyperLEDA, or SDSS-DR12.  Those compendia carry
 *     spec-z entries; rows with only the 2MASS name set are 2MPZ
 *     photo-z entries (~935 k of GLADE's 2.1 M usable rows).
 *
 * Why the spec-z option matters for the renderer: 2MPZ's σ_z ≈ 0.015
 * smears galaxy radial positions by ~60 Mpc at z = 0.1, washing out the
 * cosmic-web filaments that are physically only ~5 Mpc thick.  Filtering
 * to spec-z keeps fewer galaxies (~200-500 k instead of 2.1 M) but each
 * one is placed accurately in 3 D, so the filament structure becomes
 * visible.
 */
export type GladeParseOptions = {
  specZOnly?: boolean;
  /**
   * Drop rows whose only parent catalogue is SDSS-DR12.
   *
   * SDSS-DR12 covers only ~1/3 of the sky but reaches z > 0.5; beyond
   * ~600 Mpc those rows dominate GLADE inside the SDSS footprint and
   * leave a gap outside it.  In 3D space this looks like radial
   * "jets" of galaxies extending from origin only in the SDSS
   * direction — a visually striking but artefactual structure.
   *
   * Filtering keeps rows that appear in any all-sky parent catalogue
   * (HyperLEDA, GWGC, 2MASS XSC, 2MPZ).  These remaining rows have
   * approximately uniform angular completeness — the deep pencil-beam
   * structure disappears, at the cost of dropping 30–50 % of the high-
   * redshift GLADE galaxies (which are the SDSS-only ones).
   *
   * Independent of `specZOnly` — caller can enable either, both, or
   * neither.  This is a build-time flag (rebuild `glade.bin` with
   * `--glade-isotropic`) rather than a runtime toggle, because the
   * alternative — baking parent-catalogue provenance into the `.bin`
   * schema — is a much bigger change for what's effectively a
   * permanent decision the user makes once for their dataset.
   */
  isotropic?: boolean;
};

/** Index of a column field that holds an "is non-empty" check for a name. */
function nameIsPopulated(line: string, startByte0Based: number, endByte0Based: number): boolean {
  const slice = line.slice(startByte0Based, endByte0Based).trim();
  // GLADE marks an unset name field with `---` (or longer dash run).
  return slice.length > 0 && !/^-+$/.test(slice);
}

/**
 * Parse a single GLADE line into a record, or return `null` to indicate the
 * row should be counted as skipped. Exposed so that streaming consumers
 * (e.g. `tools/buildAllBins.ts` reading the 800 MB GLADE file line-by-line
 * because Node refuses to allocate a >512 MB string) can apply the same
 * row-level filter logic without going through the all-at-once `parseGlade`
 * entry point.
 *
 * The whole-file `parseGlade` below is now a thin wrapper around this
 * function; the row-filter rules and byte offsets live in exactly one place.
 */
export function parseGladeLine(
  line: string,
  options: GladeParseOptions = {},
  hyperLeda: HyperLedaShapeMap = new Map(),
): ParsedRecord | null {
  if (line.length < MIN_LINE_LEN) {
    // Truncated row — can't safely slice the trailing flag bytes.
    return null;
  }

  // Flag1 lives at byte 104 (0-based 103). Test it before parsing the
  // numeric fields so quasars/globulars don't waste a `parseFloat`.
  const flag1 = line.charAt(103);
  if (flag1 !== 'G') return null;

  // Flag2 lives at byte 254 (0-based 253). '0' means "no measured z or
  // distance" — GLADE's own admission that this row is unplaceable.
  const flag2 = line.charAt(253);
  if (flag2 === '0') return null;

  // ── Spec-z filter (opt-in) ──────────────────────────────────────────────
  //
  // When the caller asks for spec-z only, drop rows that are likely 2MPZ
  // photo-z entries.  See the GladeParseOptions docstring for the rationale.
  if (options.specZOnly) {
    if (flag2 === '1') {
      // Flag2 = '1' is ambiguous; trust the row only if at least one of the
      // spec-z-dominated parent catalogs (GWGC, HyperLEDA, SDSS-DR12) names
      // is populated.  GWGC bytes 9-36, HyperLEDA bytes 38-66, SDSS-DR12
      // bytes 85-102 (1-based; 0-based half-open: 8-36, 37-66, 84-102).
      const hasSpecZSourceName =
        nameIsPopulated(line, 8, 36) ||
        nameIsPopulated(line, 37, 66) ||
        nameIsPopulated(line, 84, 102);
      if (!hasSpecZSourceName) return null;
    }
    // Flag2 ∈ {'2', '3'} → keep regardless (those rows have crisp distance
    // or a confirmed spec-z replacement; no parent-catalog check needed).
  }

  // ── Angular-isotropy filter (opt-in) ────────────────────────────────────
  //
  // Drop rows whose ONLY populated parent name is SDSS-DR12.  See the
  // GladeParseOptions docstring for the rationale.  We don't check 6dFGS
  // here even though it's also footprint-restricted (southern hemisphere
  // only) because 6dFGS contributes uniformly within its footprint and
  // covers a hemisphere — that's coverage we want, not pencil-beam noise.
  //
  // Byte ranges (0-based half-open, verified against real catalog rows):
  //   GWGC      8-36   (1-based 9-36 in the ReadMe)
  //   HyperLEDA 37-66  (1-based 38-66)
  //   2MASS XSC 67-84  (1-based 68-84) — note: plan quoted 68-84 (0-based)
  //                     but the field actually starts at byte 67 in the
  //                     fixed-width layout, e.g. NGC 253's `00473313-…`.
  //   SDSS-DR12 84-102 (1-based 85-102)
  if (options.isotropic) {
    const inSdssOnly =
      nameIsPopulated(line, 84, 102) && // SDSS-DR12 populated
      !nameIsPopulated(line, 8, 36) && // GWGC empty
      !nameIsPopulated(line, 37, 66) && // HyperLEDA empty
      !nameIsPopulated(line, 67, 84); // 2MASS XSC empty
    if (inSdssOnly) return null;
  }

  // RA: bytes 106-123. F18.14 means up to 14 fractional digits in 18
  // chars; we just trim and `parseFloat`. RA is always populated, so
  // a NaN here signals a corrupted download, not a missing field.
  const ra = parseFloat(line.slice(105, 123).trim());
  // Dec: bytes 125-144 (F20.15).
  const dec = parseFloat(line.slice(124, 144).trim());
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;

  // z: bytes 174-191 (E18.15). Sentinel `---` is common when only a
  // distance was measured photometrically — `parseFloatOrNaN` collapses
  // those to NaN so the `isFinite` check below catches them uniformly.
  // We also drop z <= 0: GLADE excludes local-group blueshifts by
  // construction (unlike 2MRS), so a non-positive z is junk here.
  const z = parseFloatOrNaN(line.slice(173, 191));
  if (!Number.isFinite(z) || z <= 0) return null;

  // Photometry. All four fields use the dash-sentinel convention, plus the
  // numeric-sentinel gate in `parseMagOrNaN`; any missing band collapses to
  // NaN and propagates correctly through the renderer's colour computation.
  // We deliberately do *not* skip the row when a band is missing — partial
  // photometry is still useful for sorting by apparent brightness in one of
  // the other bands.
  const bmag = parseMagOrNaN(line.slice(192, 198)); // bytes 193-198
  const jmag = parseMagOrNaN(line.slice(214, 220)); // bytes 215-220
  const hmag = parseMagOrNaN(line.slice(227, 233)); // bytes 228-233
  const kmag = parseMagOrNaN(line.slice(240, 246)); // bytes 241-246

  // PGC sits in bytes 1-7 (0-based: 0-7). Empty/sentinel rows (`---`, `0`) are
  // common — those rows just won't find a match in the cache and will fall
  // through to the deterministic fallback at build time.
  const pgcRaw = line.slice(0, 7).trim();
  const pgcKey = pgcRaw === '' || /^-+$/.test(pgcRaw) || pgcRaw === '0' ? null : pgcRaw;
  const ledaEntry = pgcKey ? hyperLeda.get(pgcKey) : undefined;

  // GLADE doesn't carry a measured galaxy radius; instead we route the
  // apparent B magnitude through the Tully (1988) size–luminosity relation
  // to derive a sensible diameter.  We first convert z to a comoving distance
  // (Hubble's law, H0 = 70) so we can compute the absolute B magnitude, then
  // feed that into galaxyDiameterKpc.
  //
  // When Bmag is missing (dash sentinel → NaN), we emit null and let the
  // build pipeline apply DEFAULT_GALAXY_DIAMETER_KPC.  Routing through
  // `null` rather than the constant default here keeps the "real measurement
  // vs fallback" provenance visible at the parser boundary, mirroring how
  // axisRatio + positionAngleDeg are handled.
  let diameterKpc: number | null = null;
  if (Number.isFinite(bmag) && Number.isFinite(z) && z > 0) {
    const distanceMpc = redshiftToDistanceMpc(z);
    const absB = absoluteMagnitude(bmag, distanceMpc);
    if (Number.isFinite(absB)) {
      const d = galaxyDiameterKpc({ absMagBmag: absB });
      // galaxyDiameterKpc returns DEFAULT_GALAXY_DIAMETER_KPC when its input
      // is bad — we detect that case and emit null instead, so the pipeline's
      // default-application path runs uniformly for ALL "no measurement"
      // rows regardless of which parser produced them.
      if (d !== DEFAULT_GALAXY_DIAMETER_KPC) diameterKpc = d;
    }
  }

  return {
    source: Source.Glade,
    // We repurpose the SDSS-shaped 64-bit `objID` slot to carry the
    // GLADE row's HyperLEDA PGC number when one is present.  PGCs are
    // 32-bit-bounded integers (max ≈ 6 M today), so they fit trivially
    // inside the existing 64-bit field — no format bump or sidecar
    // needed.  Runtime consumers branch on `source` to decide how to
    // interpret the value:
    //   - SDSS    → the 64-bit SDSS DR18 objID (image cutouts, Explorer)
    //   - GLADE   → the PGC number (NED `?objname=PGC+<n>` link)
    //   - 0n      → no identifier (GLADE rows whose source line had a
    //                blank/sentinel PGC, plus 2MRS / synthetic rows)
    //
    // The merger's dedup pass treats GLADE rows with PGC=0n as "no
    // SDSS anchor, match by position+z instead", which is also the
    // correct fallback now: a non-zero GLADE objID is a PGC, not an
    // SDSS objID, so dedup must continue to ignore it.
    objID: pgcKey ? BigInt(pgcKey) : 0n,
    ra,
    dec,
    z,
    spectroscopicZ: z,
    // Heterogeneous-photometry mapping — see module docstring.
    magU: NaN,
    magG: bmag,
    magR: jmag,
    magI: hmag,
    magZ: kmag,
    // Orientation: when HyperLEDA has a row for this PGC, use its measured
    // PA + axisRatio. Otherwise leave both null and let the build pipeline
    // route the row through the deterministic fallback (so every galaxy
    // ends up with *some* orientation, just not necessarily a real one).
    axisRatio: ledaEntry ? ledaEntry.axisRatio : null,
    positionAngleDeg: ledaEntry ? ledaEntry.pa : null,
    diameterKpc,
    // GLADE rows have no AGN class signal and no Milliquas
    // parent-survey prefix; both bytes stay 0.
    classByte: 0,
    parentSurveyByte: 0,
  };
}

/**
 * Extract just the (2MASX-name → PGC-number) pair from a single GLADE line,
 * or null when either field is unset.
 *
 * Used by the build pipeline to cross-pollinate PGC numbers into 2MRS
 * records: 2MRS itself has no PGC column, so its records carry
 * `objID = 0n` and the InfoCard's NED link falls back to a near-position
 * search (which can land on the wrong row in dense fields).  GLADE was
 * designed to ingest 2MASS XSC + HyperLEDA, so its source rows already
 * carry both the matching 2MASX-name and the canonical PGC; this
 * extractor harvests that pair so the buildAllBins streaming loop can
 * patch PGCs into 2MRS records via a single in-memory map lookup keyed
 * by the 16-char 2MASX designation (which both catalogs spell
 * identically — see the build pipeline's twoMrs.massId join).
 *
 * Why a parallel single-purpose extractor rather than refactoring
 * parseGladeLine to return (record, pair)?  Two reasons:
 *
 *   1. Symmetry of skip rules.  parseGladeLine drops rows on Flag1!='G'
 *      and Flag2='0', but those rules are about whether the row is
 *      *renderable* — not whether its 2MASX→PGC mapping is valid.  A
 *      GLADE quasar (Flag1='Q') or a no-distance row (Flag2='0') still
 *      carries a perfectly good PGC and 2MASX name pair if those columns
 *      are populated, and a 2MRS row that happens to share the 2MASX
 *      name (different object class on the upstream side, same XSC
 *      cross-ID) can legitimately benefit from the link.  Filtering
 *      those rows out of the map would silently drop coverage.
 *
 *   2. Single-responsibility.  Each extractor stays small and obviously
 *      correct in isolation; the streaming loop calls both per row and
 *      gets independent yes/no answers for "include this row in records"
 *      and "include this mapping in the map".
 *
 * Returning a structurally-tiny tuple-like object keeps allocations
 * minimal during the streaming parse of GLADE's ~2.4 M rows.  We use
 * BigInt for the PGC because the rest of the pipeline carries `objID`
 * as `bigint` end-to-end — converting at the parser boundary keeps the
 * downstream patch-into-2MRS loop fully bigint-typed without coercion.
 */
export function parseGlade2masxPgcLine(line: string): { massId: string; pgc: bigint } | null {
  if (line.length < MIN_LINE_LEN) return null;

  // PGC: bytes 1-7 (1-based inclusive) → slice(0, 7).  Sentinel rules
  // mirror parseGladeLine's pgcKey logic exactly: empty cell, any run
  // of dashes, or the literal `0` (GLADE uses 0 to mean "no PGC", same
  // as SDSS uses 0 for objID) all collapse to "no PGC available".
  const pgcRaw = line.slice(0, 7).trim();
  if (pgcRaw === '' || /^-+$/.test(pgcRaw) || pgcRaw === '0') return null;

  // 2MASX name: bytes 68-83 (1-based inclusive) → slice(67, 83).  Per
  // the VII/281 ReadMe (`68- 83  A16   ---     2MASS`).  GLADE marks
  // unset name fields with a run of dashes (`---`) — same convention
  // as every other ID column — so we apply the same dash-only filter
  // as nameIsPopulated above.  We trim() before checking length so a
  // field that's all spaces (no dashes, no name) also collapses to "".
  const massId = line.slice(67, 83).trim();
  if (massId === '' || /^-+$/.test(massId)) return null;

  return { massId, pgc: BigInt(pgcRaw) };
}

/**
 * Parse a GLADE v2.3 catalog blob (`data/raw/glade/glade2.3.dat`) into canonical
 * records. See the module docstring for byte layout, mapping rationale,
 * and skip rules.
 *
 * Why this parser does *not* use the shared `nonCommentLines` helper:
 * `nonCommentLines` discards any line whose trimmed form starts with
 * `--`, treating it as a SQL-style comment. That rule is right for
 * SDSS CSVs but *wrong* for GLADE — a real catalog row whose PGC and
 * name columns are all sentinel `---` (about 1 row in 5 in v2.3) trims
 * to a `---`-leading string and would be silently dropped. Splitting
 * lines locally with no comment filter avoids that misclassification.
 */
export function parseGlade(
  rawText: string,
  options: GladeParseOptions = {},
  hyperLeda: HyperLedaShapeMap = new Map(),
): GladeResult {
  // Local line split: just normalise CRLF and break on '\n', then drop
  // empty lines. We deliberately *don't* strip `#` or `--` comment
  // prefixes here — see the docstring above.
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.length > 0);

  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    const rec = parseGladeLine(line, options, hyperLeda);
    if (rec === null) {
      skipped++;
    } else {
      records.push(rec);
    }
  }

  return { records, skipped };
}
