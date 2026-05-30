/**
 * MCXC Meta-Catalogue of X-ray detected Clusters of galaxies parser —
 * VizieR catalog J/A+A/534/A109 (Piffaretti et al. 2011, A&A 534, A109).
 *
 * The MCXC is a homogenised compilation of 12 input ROSAT-based X-ray cluster
 * catalogues (NORAS, REFLEX, BCS, SGP, NEP, MACS, CIZA, 160SD, 400SD, SHARC,
 * WARPS, EMSS), deduplicated to 1743 unique clusters.  For each cluster it
 * provides three identifiers, a redshift, RA/Dec, and standardised L500/M500/R500
 * at an overdensity of Δ = 500 relative to the critical density at the cluster's z.
 *
 * Why the MCXC belongs in this pipeline: it gives the cluster-coverage feature
 * (~375 structures spanning MCXC + MSCC) a physically meaningful radius (R500
 * in Mpc) rather than a crude z-derived estimate.  Using R500 directly from the
 * catalogue avoids re-deriving M500→R500 from the virial mass — which would
 * require assuming a concentration–mass relation and a cosmology — and keeps
 * the provenance traceable back to the peer-reviewed ROSAT analyses.
 *
 * ---
 * ### Format: 323-byte fixed-width ASCII, 1743 records (mcxc.dat).
 *
 * Byte ranges below are 1-based inclusive (as published in the ReadMe).
 * JS `String.prototype.slice` is 0-based half-open, so ReadMe range `a–b`
 * maps to `.slice(a-1, b)`.  All numeric fields are space-padded on the left
 * (F7.3, F6.4, F7.4 formats), so we trim before `parseFloat`.
 *
 * Fields extracted:
 *
 *   bytes 1–12    MCXC id         A12, e.g. 'J0000.1+0816'
 *   bytes 14–31   OName           A18, usually the RXC/REFLEX designation
 *   bytes 33–86   AName           A54, Abell number or popular name (often blank)
 *   bytes 109–115 RAdeg           F7.3 deg — decimal RA, J2000
 *   bytes 117–123 DEdeg           F7.3 deg — decimal Dec, J2000 (signed)
 *   bytes 141–146 z               F6.4 — spectroscopic redshift
 *   bytes 190–196 M500            F7.4, in 10^14 M☉
 *   bytes 198–204 R500            F7.4, Mpc (characteristic radius within Δ500)
 *
 * Why decimal RAdeg/DEdeg over the sexagesimal h:m:s/d:m:s columns?
 * The sexagesimal columns span bytes 88–107, which is a 20-byte stretch split
 * across six fields (RAh, RAm, RAs, DE-, DEd, DEm, DEs).  Converting them
 * requires parsing the sign byte (byte 99) separately from the degree/arcmin/
 * arcsec fields and then doing h*15 + m*0.25 + s*0.00417 arithmetic.  The
 * ReadMe explicitly provides pre-computed decimal equivalents at bytes 109–123;
 * using those is strictly less error-prone and produces the same bit-identical
 * result, because the MCXC team computed them from the same underlying angles.
 *
 * ---
 * ### Line-length note
 *
 * The ReadMe header says `Lrecl = 323`, but rows lacking Notes/overlap
 * columns are typically ~204 characters long — the trailing fields (Cat1–Cat4,
 * L500r1–r4) are absent for clusters with no catalogue overlaps.  All fields
 * we extract end by byte 204, so they're present on every row.  We guard
 * against short lines (< 204 bytes) to avoid silent NaN from slicing past the
 * string end, but we do NOT require the full 323-byte width.
 */

/** Minimum useful line length — R500 column ends at byte 204. */
const MIN_LINE_LEN = 204;

/**
 * A single parsed MCXC cluster row, carrying the fields the cluster-coverage
 * pipeline consumes.  String fields are trimmed; blank columns become `''`.
 */
export type McxcRow = {
  /** MCXC primary identifier, e.g. `'J0000.1+0816'`. */
  id: string;
  /** Right ascension in decimal degrees (J2000), [0, 360). */
  raDeg: number;
  /** Declination in decimal degrees (J2000), [−90, 90]. */
  decDeg: number;
  /** Spectroscopic redshift. */
  z: number;
  /** Total mass within R500, in units of 10^14 M☉. */
  m500: number;
  /** Characteristic radius R500, in Mpc. */
  r500Mpc: number;
  /** 'Other name' — usually the RXC/REFLEX designation; `''` if blank. */
  oName: string;
  /** 'Alternative name' — Abell/UGC/popular name; `''` if blank. */
  aName: string;
};

/**
 * Parse a raw `mcxc.dat` blob (or any substring of it) into an array of
 * `McxcRow` objects.
 *
 * The function is deliberately IO-free: it accepts a pre-read string so it
 * can be called from unit tests with synthetic or real-row fixtures without
 * touching the filesystem.  Production callers read `rawDataPath('mcxc.table')`
 * and pass the result straight in.
 *
 * Skip rules:
 * - Blank lines and lines whose first non-whitespace character is `#` are
 *   treated as comments and skipped.  VizieR ReadMe headers use `#` for
 *   provenance comments that occasionally appear above the data block in
 *   programmatically-downloaded files.
 * - Lines shorter than `MIN_LINE_LEN` (204) can't carry R500 and are skipped
 *   rather than silently producing NaN.
 * - Rows where RAdeg, DEdeg, z, M500, or R500 fail to parse as finite
 *   numbers are skipped; the MCXC has no known sentinel values for those
 *   fields, but a corrupt download could produce truncated numeric columns.
 */
export function parseMcxc(raw: string): McxcRow[] {
  const rows: McxcRow[] = [];

  // Normalise CRLF before splitting so Windows-format downloads work too.
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    // Skip blank lines and VizieR comment lines (start with '#').
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Guard against rows that end before the R500 column (byte 204).
    // `slice` past the string end silently returns `''`, which `parseFloat`
    // turns into NaN — bailing out here makes short-line skips explicit and
    // counted rather than silent.
    if (line.length < MIN_LINE_LEN) continue;

    // ── Field extraction ────────────────────────────────────────────────────
    //
    // All byte ranges are 1-based inclusive per the ReadMe.
    // JS slice(a-1, b) is the equivalent 0-based half-open form.

    // MCXC primary id: bytes 1–12
    const id = line.slice(0, 12).trim();

    // OName: bytes 14–31 (A18)
    const oName = line.slice(13, 31).trim();

    // AName: bytes 33–86 (A54) — often all spaces for clusters without
    // a common Abell/UGC name.  `.trim()` converts all-space to `''`.
    const aName = line.slice(32, 86).trim();

    // RAdeg: bytes 109–115 (F7.3 deg) — pre-computed decimal degrees.
    // We use this instead of the sexagesimal columns (bytes 88–107) because
    // the decimal form requires no sign-byte assembly and no
    // h→° conversion arithmetic; see the module docstring for rationale.
    const raDeg = parseFloat(line.slice(108, 115).trim());

    // DEdeg: bytes 117–123 (F7.3 deg) — signed; negative for southern sky.
    const decDeg = parseFloat(line.slice(116, 123).trim());

    // z: bytes 141–146 (F6.4)
    const z = parseFloat(line.slice(140, 146).trim());

    // M500: bytes 190–196 (F7.4, units: 10^14 M☉)
    const m500 = parseFloat(line.slice(189, 196).trim());

    // R500: bytes 198–204 (F7.4, units: Mpc)
    const r500Mpc = parseFloat(line.slice(197, 204).trim());

    // Skip rows where any required numeric field failed to parse.  The MCXC
    // has no documented sentinel for missing values in these columns; a NaN
    // here means the file is truncated or the wrong format.
    if (
      !Number.isFinite(raDeg) ||
      !Number.isFinite(decDeg) ||
      !Number.isFinite(z) ||
      !Number.isFinite(m500) ||
      !Number.isFinite(r500Mpc)
    ) {
      continue;
    }

    rows.push({ id, raDeg, decDeg, z, m500, r500Mpc, oName, aName });
  }

  return rows;
}
