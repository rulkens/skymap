/**
 * MSCC Main SuperCluster Catalogue parser —
 * VizieR catalog J/MNRAS/445/4073 (Chow-Martinez et al. 2014, MNRAS 445, 4073).
 *
 * The MSCC is a Friends-of-Friends compilation of 601 all-sky superclusters of
 * Abell/ACO rich clusters out to z = 0.15.  Each row gives the supercluster's
 * sky position, mean redshift, multiplicity (number of member clusters), and
 * the maximum separation among member-cluster pairs.  The companion SSCC
 * (Southern SuperCluster Catalogue, 423 rows, `sscc.dat`) shares the identical
 * byte layout but covers δ < −17° and includes supplementary Abell S-clusters;
 * this parser handles `mscc.dat` only.
 *
 * Why MSCC in this pipeline?  Together with the MCXC X-ray cluster catalogue,
 * it supplies the ~375-structure structure-coverage feature with large-scale
 * supercluster envelopes.  MCXC gives physically calibrated R500 radii for
 * individual X-ray clusters; MSCC gives the Friend-of-Friends extent (`dmax`)
 * for supercluster complexes, letting the renderer draw an outer coverage halo
 * around e.g. the Perseus–Pisces or Shapley supercluster.
 *
 * ---
 * ### Format: fixed-width ASCII, 601 records (mscc.dat).
 *
 * Byte ranges below are 1-based inclusive (as published in the ReadMe).
 * JS `String.prototype.slice` is 0-based half-open, so ReadMe range `a–b`
 * maps to `.slice(a-1, b)`.  The `slot(line, a, b)` helper from `common.ts`
 * encapsulates this conversion so the byte numbers here match the ReadMe
 * verbatim.
 *
 * Fields extracted:
 *
 *   bytes 1–3    Seq       I3  — id number 1–601 → rendered as 'MSCC NNN'
 *   bytes 24–25  Nm        I2  — member-cluster count [2, 42]
 *   bytes 27–32  RAdeg     F6.2  deg — decimal right ascension, J2000
 *   bytes 34–39  DEdeg     F6.2  deg — decimal declination, J2000 (signed)
 *   bytes 41–45  z         F5.3  — mean redshift [0.01, 0.15]
 *   bytes 47–51  dmax      F5.1  h70^-1 Mpc — max member-pair separation
 *
 * Why decimal RAdeg/DEdeg instead of sexagesimal?  The ReadMe publishes only
 * decimal-degree columns for MSCC (unlike MCXC which carries both).  There is
 * no sexagesimal fallback to parse — the decimal form is the only option.
 *
 * The SCLs field (bytes 6–21, A16) is the Einasto et al. 2001 cross-reference;
 * it is not consumed by the structure-coverage pipeline and is intentionally
 * skipped here to keep the output type minimal.
 *
 * The trailing `memCl` field (bytes 53–324, A272) is a comma-separated list of
 * member Abell cluster designations.  Lines may therefore be much shorter than
 * 324 bytes for superclusters with few members; all fields we extract end by
 * byte 51, so we only require `MIN_LINE_LEN = 51`.
 *
 * ---
 * ### `nonCommentLines` safety check
 *
 * `nonCommentLines` skips lines whose first non-whitespace character is `#` or
 * whose content starts with `--`.  MSCC Seq values look like `  1`, `  2`, …,
 * `601` — the first non-whitespace character is always a digit, never `#` or
 * `-`.  Using `nonCommentLines` is safe; it is a no-op for all real data rows
 * (the `--` SQL-comment guard is there for SDSS CSV headers and is harmless
 * here).
 *
 * ---
 * ### `dmaxMpc` units — raw h70^-1 Mpc, not converted
 *
 * `dmax` is stored in raw h70^-1 Mpc as published.  The conversion to physical
 * Mpc (divide by h70 = 0.7) and the halving to a radius (dmax is a diameter:
 * the maximum *pair* separation, not the centroid-to-edge distance) both happen
 * in the `buildStructures` pipeline step (Task 10), not here.  The parser is a
 * faithful column reader; it does not interpret units.
 */

import { nonCommentLines, slot } from './common.js';

/** Minimum useful line length — all required fields end at byte 51. */
const MIN_LINE_LEN = 51;

/**
 * A single parsed MSCC supercluster row, carrying the fields consumed by the
 * structure-coverage pipeline.  Numeric fields are trimmed and `parseFloat`'d;
 * no unit conversions are applied.
 */
export type MsccRow = {
  /** MSCC primary identifier, e.g. `'MSCC 1'` (Seq parsed as integer, not zero-padded). */
  id: string;
  /** Right ascension in decimal degrees (J2000), [0, 360). */
  raDeg: number;
  /** Declination in decimal degrees (J2000), [−90, 90]. */
  decDeg: number;
  /** Mean redshift of the supercluster. */
  z: number;
  /** Number of member Abell clusters, [2, 42]. */
  nm: number;
  /**
   * Maximum separation of a member-cluster pair, in **raw h70^-1 Mpc**
   * (as published).  Do NOT interpret as a radius — `dmax` is the diameter
   * of the tightest enclosing sphere.  The h70→Mpc conversion and the
   * halving to a centroid radius live in `buildStructures` (Task 10).
   */
  dmaxMpc: number;
};

/**
 * Parse a raw `mscc.dat` blob (or any substring of it) into an array of
 * `MsccRow` objects.
 *
 * The function is deliberately IO-free: it accepts a pre-read string so it
 * can be called from unit tests with synthetic or real-row fixtures without
 * touching the filesystem.  Production callers read `rawDataPath('mscc.table')`
 * and pass the result straight in.
 *
 * Skip rules:
 * - Blank lines and lines whose first non-whitespace character is `#` or `--`
 *   are treated as comments and skipped via `nonCommentLines`.
 * - Lines shorter than `MIN_LINE_LEN` (51) can't carry `dmax` and are skipped
 *   rather than silently producing NaN.
 * - Rows where Seq, Nm, RAdeg, DEdeg, z, or dmax fail to parse as finite
 *   numbers are skipped; the MSCC has no documented sentinel for missing values
 *   in these columns, so a NaN here indicates a truncated or misformatted file.
 */
export function parseMscc(raw: string): MsccRow[] {
  const rows: MsccRow[] = [];

  // `nonCommentLines` handles CRLF normalisation, blank lines, and `#`/`--`
  // comment lines — all three filters we need here.  MSCC Seq values are
  // space-prefixed integers (e.g. '  1'), so the `#` and `--` guards never
  // fire on real data rows.
  for (const line of nonCommentLines(raw)) {
    // Guard against lines that end before the dmax column (byte 51).
    // `slice` past the string end silently returns '', which `parseFloat`
    // turns into NaN — bailing out explicitly here keeps short-line skips
    // visible and counted rather than silent.
    if (line.length < MIN_LINE_LEN) continue;

    // ── Field extraction ────────────────────────────────────────────────────
    //
    // All byte ranges are 1-based inclusive per the ReadMe.
    // `slot(line, start, end)` handles the 1-based → 0-based translation
    // so the numbers here match the ReadMe verbatim.

    // Seq: bytes 1–3 (I3) — the catalog id number, e.g. '  1' → 1.
    // parseInt strips leading spaces and leading zeros identically.
    const seq = parseInt(slot(line, 1, 3), 10);

    // Nm: bytes 24–25 (I2) — member-cluster multiplicity, range [2, 42].
    const nm = parseInt(slot(line, 24, 25), 10);

    // RAdeg: bytes 27–32 (F6.2 deg) — pre-computed decimal degrees.
    const raDeg = parseFloat(slot(line, 27, 32));

    // DEdeg: bytes 34–39 (F6.2 deg) — signed; negative for southern sky.
    // The F6.2 field includes the sign character ('+' or '-'); parseFloat
    // handles both transparently.
    const decDeg = parseFloat(slot(line, 34, 39));

    // z: bytes 41–45 (F5.3) — mean redshift of the supercluster.
    const z = parseFloat(slot(line, 41, 45));

    // dmax: bytes 47–51 (F5.1, h70^-1 Mpc) — maximum member-pair separation.
    // Stored as-published; the caller supplies unit conversion if needed.
    const dmaxMpc = parseFloat(slot(line, 47, 51));

    // Skip rows where any required field failed to parse.  The MSCC has no
    // documented sentinel for missing numeric values; NaN here means the file
    // is truncated or the wrong format.
    if (
      !Number.isFinite(seq) ||
      !Number.isFinite(nm) ||
      !Number.isFinite(raDeg) ||
      !Number.isFinite(decDeg) ||
      !Number.isFinite(z) ||
      !Number.isFinite(dmaxMpc)
    ) {
      continue;
    }

    // id: 'MSCC ' + Seq — parseInt already stripped leading zeros; toString()
    // gives the plain integer string (e.g. 1 → '1', not '001').
    const id = `MSCC ${seq}`;

    rows.push({ id, raDeg, decDeg, z, nm, dmaxMpc });
  }

  return rows;
}
