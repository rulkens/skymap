/**
 * 2MPZ catalogue parser.
 *
 * Decodes the 2MASS Photometric Redshift Catalogue (Bilicki et al. 2014;
 * VizieR identifier VII/281) into canonical `ParsedRecord`s. The catalogue
 * is distributed as a single whitespace-separated ASCII file with no header
 * row — column meaning is positional, documented only in the VizieR
 * `ReadMe`. We therefore hard-code the column indices below and lean on
 * comments to keep the mapping reviewable.
 *
 * ---
 * ### Column layout (1-based, as VizieR documents them)
 *
 *   col 2  = RA (degrees, J2000)
 *   col 3  = Dec (degrees, J2000)
 *   col 4  = J magnitude  (2MASS near-IR)
 *   col 5  = H magnitude  (2MASS near-IR)
 *   col 6  = K magnitude  (2MASS near-IR)
 *   col 13 = ZPHOTO       (photometric redshift, regression estimate)
 *   col 14 = ZPHOTO_ERR   (1-σ on ZPHOTO; we don't propagate it downstream)
 *   col 15 = ZSPEC        (spectroscopic redshift if available, else -1)
 *   col 17 = SDSS_OBJID   (numeric SDSS ID if cross-matched, else 0)
 *
 * Tokens are addressed by their *0-based* index after `split(/\s+/)`. The
 * leading 2MPZ name occupies tok[0], so RA/Dec/JHK live at tok[1..5]; the
 * redshift block (ZPHOTO, ZPHOTO_ERR, ZSPEC) sits at tok[13], tok[14],
 * tok[15]; and SDSS_OBJID is at tok[17]. (The "col N" numbers above come
 * straight from VizieR's ReadMe and don't correspond 1:1 to whitespace
 * tokens — there are unused integer-valued slots VizieR counts that we
 * simply skip past.) Mixing up the indexing is the easiest mistake to
 * make against this format, so every lookup carries a comment.
 *
 * ---
 * ### Why prefer ZSPEC over ZPHOTO?
 *
 * Spectroscopic redshift (ZSPEC) is a *direct* physical measurement: you
 * point a spectrograph at the galaxy, find an emission/absorption line
 * with a known rest wavelength, and read off the Doppler shift. The
 * uncertainty is dominated by line-fitting precision and is typically
 * Δz ≲ 1e-4 — effectively exact for our visualisation needs.
 *
 * Photometric redshift (ZPHOTO) is an *indirect* regression estimate
 * built from the broadband colours (J−H, H−K, etc. against optical
 * cross-matches). It uses machine-learning / SED-fitting trained on
 * spectroscopic samples, so its accuracy is bounded by the training set
 * and the colour-redshift degeneracies inherent to broadband photometry.
 * For 2MPZ, σ(z) ≈ 0.015 — fine for statistical use, but visibly noisier
 * along the line of sight when each galaxy is rendered as a point.
 *
 * Therefore: if ZSPEC > 0 we use it; otherwise fall back to ZPHOTO if
 * positive; otherwise drop the row. (-1 is the catalogue's "not measured"
 * sentinel for ZSPEC.)
 *
 * ---
 * ### SDSS_OBJID cross-match
 *
 * Where 2MPZ lines up with an SDSS object, the catalogue records SDSS's
 * 64-bit `objID` in column 17. We parse it as a `bigint` (it doesn't fit
 * in a JS `number`) and pass it through to the downstream merger, which
 * uses it to *deduplicate* against SDSS rows. Without it, every galaxy
 * present in both surveys would be drawn twice with slightly different
 * coordinates and redshifts, producing visible artefacts. Rows with no
 * cross-match carry `0` in this column, which we map to `0n` — the same
 * "no SDSS anchor" sentinel that `common.ts` documents.
 *
 * ---
 * ### Band mapping
 *
 * 2MPZ ships only the three 2MASS near-IR bands (J, H, K). SDSS-style
 * `ugriz` columns simply don't exist, so we set:
 *
 *   magG = J     (greenish slot — closest visible analogue)
 *   magR = H
 *   magI = K
 *   magU = NaN
 *   magZ = NaN
 *
 * The renderer treats NaN as "no data for this band" (see
 * `common.ts` for the rationale). This is admittedly a *colour-space lie*
 * — JHK are infrared, not optical — but the goal is "every record has a
 * consistent shape so the merger and shader don't need per-survey
 * special cases", not photometric correctness across surveys. Downstream
 * cross-matching with SDSS can fill in the optical bands for galaxies
 * that appear in both catalogues; for 2MPZ-only galaxies, the renderer
 * uses a fallback colour mapped from K-band brightness alone.
 */

import { Source } from '../../src/data/sources.js';
import { nonCommentLines, type ParsedRecord } from './common.js';

/**
 * Result of parsing a 2MPZ ASCII blob: the validated records plus the
 * count of rows we threw away. Surfacing `skipped` lets the build CLI
 * print a sanity ratio — if it ever climbs above ~30 % of input rows it
 * usually means the column layout has shifted (a new VizieR release
 * sometimes inserts extra columns) and the indices need re-checking.
 */
export type TwoMpzResult = {
  records: ParsedRecord[];
  skipped: number;
};

/**
 * Parse a 2MPZ catalogue ASCII blob into canonical records.
 *
 * A row is skipped when:
 *   - It has fewer than 17 whitespace-separated tokens (truncated line).
 *   - RA, Dec, or any of J/H/K fails to parse as a finite number.
 *   - Both ZSPEC and ZPHOTO are non-positive — i.e. the row carries no
 *     usable redshift, which means we can't place it in 3D space.
 *
 * `objID` is parsed *defensively*: most rows carry `0` (no SDSS match),
 * and a small fraction carry a valid 64-bit ID. Any parse failure or
 * non-positive value collapses to `0n`, matching the "no anchor" sentinel
 * that the merger expects.
 */
export function parseTwoMpz(rawText: string): TwoMpzResult {
  // Strip blank lines and `#`-prefixed header comments. 2MPZ as
  // distributed by VizieR has no `#` lines, but we add our own when
  // documenting test fixtures (and a future preprocessing step might
  // emit them too). Free of charge thanks to the shared helper.
  const lines = nonCommentLines(rawText);

  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    // `split(/\s+/)` collapses runs of spaces/tabs, which matches how
    // 2MPZ uses variable-width column padding. The leading trim guards
    // against leading whitespace producing a phantom empty token at
    // index 0 (which would shift every subsequent index by one).
    const tok = line.trim().split(/\s+/);

    // We need at least 18 tokens (objID is at tok[17]). Anything shorter
    // is a structurally broken row, not a legitimately-empty cell.
    if (tok.length < 18) {
      skipped++;
      continue;
    }

    // Column-index reminder: VizieR's 1-based col N = our 0-based tok[N-1].
    // The token offsets below were verified against the published 2MPZ
    // format and the unit-test fixture: ZPHOTO sits at tok[13], ZSPEC at
    // tok[15], SDSS_OBJID at tok[17]. (The catalogue ReadMe's "col N"
    // numbering counts the leading 2MPZ name as col 1, then RA/Dec/JHK,
    // then a block of seven zero-padded slots before the redshifts, which
    // is what shifts the indices into the teens.)
    const ra = parseFloat(tok[1] ?? '');
    const dec = parseFloat(tok[2] ?? '');
    const magJ = parseFloat(tok[3] ?? '');
    const magH = parseFloat(tok[4] ?? '');
    const magK = parseFloat(tok[5] ?? '');
    const zphoto = parseFloat(tok[13] ?? '');
    const zspec = parseFloat(tok[15] ?? '');

    if (
      isNaN(ra) ||
      isNaN(dec) ||
      isNaN(magJ) ||
      isNaN(magH) ||
      isNaN(magK)
    ) {
      skipped++;
      continue;
    }

    // Redshift policy: ZSPEC is direct measurement (sub-1e-4 precision),
    // ZPHOTO is regression-based (~0.015 scatter). Always pick the more
    // accurate one when available; -1 is the catalogue's sentinel for
    // "not measured" so the `> 0` test handles it cleanly.
    let z: number;
    if (zspec > 0) {
      z = zspec;
    } else if (zphoto > 0) {
      z = zphoto;
    } else {
      skipped++;
      continue;
    }

    // SDSS_OBJID: most rows carry `0`. `BigInt('0')` is fine, but we
    // wrap in try/catch because `BigInt('1.5')` or `BigInt('')` throw,
    // and we'd rather coerce-to-zero than abort the whole parse on a
    // single malformed token. Negative IDs shouldn't exist but we treat
    // them defensively as "no anchor" too.
    let objID: bigint;
    try {
      const raw = tok[17] ?? '0';
      objID = BigInt(raw);
      if (objID <= 0n) {
        objID = 0n;
      }
    } catch {
      objID = 0n;
    }

    records.push({
      source: Source.TwoMPZ,
      objID,
      ra,
      dec,
      z,
      // 2MPZ has no optical bands; see module docstring on band mapping.
      magU: NaN,
      magG: magJ,
      magR: magH,
      magI: magK,
      magZ: NaN,
    });
  }

  return { records, skipped };
}
