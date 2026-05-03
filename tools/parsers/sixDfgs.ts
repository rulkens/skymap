/**
 * 6dF Galaxy Survey (6dFGS) catalog parser.
 *
 * The 6dFGS is a southern-hemisphere spectroscopic redshift survey conducted
 * with the Six-degree Field multi-object spectrograph on the UK Schmidt
 * Telescope. We ingest its public catalogue from VizieR (catalogue ID
 * VII/259), distributed as a whitespace-separated ASCII table — a format
 * common to legacy astronomy archives but quite different from SDSS's CSV.
 *
 * The columns we care about (1-based, matching the VizieR readme):
 *
 *   col 2 → RA  (degrees, J2000)
 *   col 3 → Dec (degrees, J2000)
 *   col 4 → z   (spectroscopic redshift)
 *   col 5 → q   (quality flag, integer 1–6)
 *   col 7 → Kmag (2MASS K-band apparent magnitude)
 *
 * ---
 * ### Why keep only `q == 4`?
 *
 * The 6dFGS team assigns each redshift a quality code:
 *   1 = unknown / no redshift,
 *   2 = unreliable,
 *   3 = probable but contested,
 *   4 = reliable, high-confidence spectroscopic z,
 *   6 = reliable star (not a galaxy at all).
 *
 * Quality 4 is the gold-standard "best spectroscopic z" tier. Anything below
 * is marginal or contested and would muddy a 3D visualisation: e.g. a q=3
 * row at a contested z = 0.18 might really be at z = 0.04, placing the
 * point hundreds of Mpc out of position. Quality 6 rows are stars — they
 * sit at z ≈ 0 and have no business in a *galaxy* cloud. Filtering up
 * front means the renderer never has to apologise for fictional structure.
 *
 * ---
 * ### Why only the K band? Why NaN for ugriz?
 *
 * 6dFGS is a *purely spectroscopic* survey — it measures redshifts from
 * spectra, not photometry. The Kmag column is borrowed from 2MASS (which
 * provided the parent target list) and is the one and only photometric
 * datum we get per row. The five SDSS optical bands (u, g, r, i, z) are
 * therefore unmeasured and reported as NaN, matching the convention
 * documented in `common.ts`: NaN means "this survey doesn't carry that
 * band", not "this row has bad data".
 *
 * We map K → `magI` purely as a placeholder slot in the canonical record
 * shape; the merger may later overwrite it (or leave it) depending on
 * cross-match strategy. The important invariant is that every band we
 * *know* we lack is explicitly NaN, never silently 0 (which would look
 * like an absurdly bright object to the colour-grading shader).
 */

import { Source } from '../../src/data/sources.js';
import { nonCommentLines, type ParsedRecord } from './common.js';

/**
 * Result of parsing a 6dFGS ASCII table: the validated records plus the
 * count of rows we dropped. Surfacing `skipped` separately lets the CLI
 * sanity-check the cut — if the q==4 fraction suddenly halved, that's a
 * loud signal the input file is from a different release than expected.
 */
export type SixDfgsResult = {
  records: ParsedRecord[];
  skipped: number;
};

/**
 * Parse a 6dFGS whitespace-separated ASCII table into canonical records.
 *
 * A row is *skipped* (counted in `result.skipped`) when:
 *   - `q !== 4` — only the gold-standard spectroscopic redshifts pass.
 *     See module docstring for the rationale on each quality level.
 *   - `z <= 0` — non-positive redshift means the row isn't usefully
 *     placeable in 3D space (could be a foreground star, a catalogue
 *     error, or a blueshifted Local Group member we can't render).
 *   - Any of RA / Dec / z / Kmag fails to parse as a finite number.
 *     Without a real K we can't drive the magnitude-based rendering.
 *
 * Note `objID` is always `0n`: 6dFGS rows have no SDSS counterpart in the
 * raw catalogue, so they enter the dedup pipeline as "no anchor". The
 * merger may later cross-match by RA/Dec, but that's not this parser's
 * job — we honestly report what's in the file.
 */
export function parseSixDfgs(rawText: string): SixDfgsResult {
  // `nonCommentLines` strips `#`-prefixed VizieR readme banners and any
  // blank trailing lines, so the row loop below can assume every line it
  // sees is a real data row. Unlike SDSS CSV, 6dFGS ASCII has *no* header
  // row to skip — VizieR documents the columns out-of-band — so we don't
  // pop a header off the front.
  const lines = nonCommentLines(rawText);

  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (const line of lines) {
    // `\s+` collapses any run of spaces or tabs; we `trim()` first so a
    // leading space doesn't produce a phantom empty token at index 0.
    // The result is a flat 1-based-feeling array we then index 0-based.
    const tok = line.trim().split(/\s+/);

    // Column index map (0-based, since we're reading from `tok`):
    //   col 2 → tok[1]  RA
    //   col 3 → tok[2]  Dec
    //   col 4 → tok[3]  z
    //   col 5 → tok[4]  q
    //   col 7 → tok[6]  Kmag
    // We use `?? ''` so that a too-short line yields NaN from
    // `parseFloat('')`, which the validity check below catches uniformly.
    const ra = parseFloat(tok[1] ?? '');
    const dec = parseFloat(tok[2] ?? '');
    const z = parseFloat(tok[3] ?? '');
    // `parseInt(_, 10)` rather than `parseFloat` for q: the quality flag
    // is documented as an integer, and forcing radix 10 sidesteps any
    // chance of an octal misread on leading-zero inputs.
    const q = parseInt(tok[4] ?? '', 10);
    const kmag = parseFloat(tok[6] ?? '');

    // We use `Number.isFinite` (not just `!isNaN`) because it also rejects
    // Infinity / -Infinity, which `parseFloat('1e9999')` can produce on
    // pathological inputs. The renderer would happily encode an Infinity
    // as the float bit pattern and produce a black hole on screen.
    if (
      !Number.isFinite(ra) ||
      !Number.isFinite(dec) ||
      !Number.isFinite(z) ||
      !Number.isFinite(kmag) ||
      z <= 0 ||
      q !== 4
    ) {
      skipped++;
      continue;
    }

    records.push({
      source: Source.SixDFGS,
      // No SDSS cross-ID in the raw 6dFGS catalogue; see module docstring.
      objID: 0n,
      ra,
      dec,
      z,
      // Only K is measured. The other four bands stay NaN, signalling
      // "missing" rather than "zero" to every downstream consumer.
      magU: NaN,
      magG: NaN,
      magR: NaN,
      magI: kmag,
      magZ: NaN,
    });
  }

  return { records, skipped };
}
