/**
 * hyperledaMeandata — pure parser for HyperLEDA's `meandata` table response.
 *
 * The endpoint we target is:
 *
 *   http://atlas.obs-hp.fr/hyperleda/fG.cgi?n=meandata&a=csv&o=<NAME>
 *
 * Despite `a=csv`, the response body is **tab-separated**.  Format:
 *
 *  - Zero or more `#`-prefixed comment / banner lines.
 *  - Exactly one header line, beginning with the literal token `$objname`,
 *    then a tab-separated list of column names — every column other than
 *    `$objname` is wrapped in double quotes.
 *  - Zero or more data rows (zero when no match), tab-separated.
 *
 * One data row per match.  HyperLEDA's `meandata` table has `$objname` as
 * a unique key, so a name-lookup query returns at most one row.  When
 * HyperLEDA can't resolve the name, no data row is emitted at all — only
 * the header survives.
 *
 * ---
 *
 * ### Why a separate parser from `fetchHyperLeda.ts`?
 *
 * The existing `fetchHyperLeda.ts` parses the same wire format, but it
 * extracts only four columns (pa, logr25, logd25, e_logd25) and is
 * tightly coupled to its own caching loop.  The famous-catalog enrichment
 * needs **the entire row** — type, magnitudes, distance modulus, recession
 * velocity — so we'd be cherry-picking from `fetchHyperLeda.ts` no matter
 * what.  A small standalone parser keeps the two concerns separate and
 * gives us a clean test surface.
 *
 * The parser is deliberately **pure**: it takes a string, returns a
 * structured row (or null).  No fetch, no I/O.  All network is in the
 * caller (`expandFamousFromCatalogs.ts`), via an injected fetcher.  This
 * is the testability pattern the project uses everywhere else.
 *
 * ---
 *
 * ### What does "row useless" mean (returning null)?
 *
 * If the response has no header line, OR the header has no data rows,
 * we return `null`.  An empty data row (header but no body) means
 * HyperLEDA didn't find the named object — this is a soft error
 * (caller logs + skips), distinct from a hard fetch error.
 */

/**
 * The fields we extract from a meandata row.  Numeric fields are `NaN`
 * when the column was empty in the response (HyperLEDA frequently has
 * partial coverage — e.g. a galaxy with photometry but no distance
 * modulus, or a B-band but no V-band).  String fields are the empty
 * string when missing.
 *
 * Field meanings + units:
 *
 *  - `objname`: the resolved name (HyperLEDA's canonical form).
 *  - `pgc`: PGC catalog number (numeric string, e.g. "2557" for M31).
 *  - `objtype`: `'G'` for galaxy, `'*'` for star, `''` for unknown.
 *    HyperLEDA pads this column with a trailing space — we trim before
 *    comparison.  This is the field used to filter Caldwell entries
 *    that point at clusters / nebulae rather than galaxies.
 *  - `al2000`: RA in **hours** (J2000).  Multiply by 15 for degrees.
 *  - `de2000`: Dec in **degrees** (J2000).
 *  - `type`: Hubble morphological type, free-form (e.g. `"Sb"`).
 *  - `logd25` / `logr25`: see `0.1 * 10^logd25` (arcmin) and
 *    `10^(-logr25)` (b/a) conversions, both standard HyperLEDA defs.
 *  - `pa`: position angle in degrees, [0, 180), east of north.
 *  - `bt`/`vt`/`kt` and matching `e_*`: total apparent mag in B/V/K
 *    bands and their uncertainties.  HyperLEDA aggregates from many
 *    upstream sources, so error bars vary wildly — see the magnitude
 *    rejection rule (e_* > 0.5 ⇒ reject) in the consumer.
 *  - `mod0` / `e_mod0`: true distance modulus (distance-independent
 *    estimator, mean of redshift-independent indicators).  Convert
 *    to Mpc via `d = 10^((mod0 - 25) / 5)`.
 *  - `v3k`: CMB-frame recession velocity in km/s.  Hubble-flow
 *    distance fallback: `d_Mpc = v3k / H0` with H0 = 70.
 *  - `mabs`: absolute magnitude — sanity-check / debug only.
 */
export type HyperLedaMeandataRow = {
  objname: string;
  pgc: string;
  objtype: string;
  al2000: number;
  de2000: number;
  type: string;
  logd25: number;
  logr25: number;
  pa: number;
  bt: number;
  e_bt: number;
  vt: number;
  e_vt: number;
  kt: number;
  e_kt: number;
  mod0: number;
  e_mod0: number;
  v3k: number;
  mabs: number;
};

/**
 * Parse the column header line (the one starting with `$objname`) into
 * a name → index lookup.  We strip the surrounding double-quotes from
 * every column name so the returned indices key off plain strings.
 *
 * Why lookup-by-name rather than hard-coded byte offsets?  HyperLEDA's
 * meandata table has been stable for years, but their CSV/TSV column
 * order has changed once (a `e_logd25` column was added between
 * `logd25` and `logr25` ~2018).  Indexing by name is robust to that
 * kind of insertion; indexing by position would silently corrupt every
 * field after the inserted one.
 */
function parseHeader(headerLine: string): Map<string, number> {
  const idx = new Map<string, number>();
  // HyperLEDA emits the header as `$objname "pgc" "objtype" ...` — the
  // first token is bare, the rest are double-quoted, and they're delimited
  // by spaces (NOT tabs, even though the data rows below use tabs).  We
  // extract column names with a regex that grabs either `$objname` or any
  // quoted token, in order.  This is robust to whatever whitespace the
  // server happens to emit between columns and matches data-row column
  // index 0 = first matched token, 1 = second, etc.
  const tokens = headerLine.match(/\$objname|"[^"]+"/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const name = tokens[i]!.replace(/^"|"$/g, '');
    if (name.length > 0) idx.set(name, i);
  }
  return idx;
}

/**
 * Extract one cell as a string, returning `''` for missing/blank cells.
 */
function strCell(cells: string[], i: number | undefined): string {
  if (i === undefined) return '';
  return (cells[i] ?? '').trim();
}

/**
 * Extract one cell as a number, returning `NaN` for missing/blank cells.
 *
 * Why NaN and not throw?  HyperLEDA legitimately has missing values
 * for any galaxy in any column — propagating NaN lets the caller
 * decide whether absence is fatal (e.g. no RA → skip) or recoverable
 * (e.g. no V-band → still keep the entry, just don't write magV).
 */
function numCell(cells: string[], i: number | undefined): number {
  if (i === undefined) return NaN;
  const t = (cells[i] ?? '').trim();
  if (t === '') return NaN;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : NaN;
}

/**
 * Parse a full HyperLEDA meandata response body.  Returns the first
 * data row's extracted fields, or `null` if the response has no
 * usable data row (header missing OR no data rows at all).
 *
 * Note: HyperLEDA emits the data row *immediately* after the header,
 * but earlier comment lines may be `#`-prefixed banners.  We scan
 * line-by-line, locking onto the first `$objname` header line and
 * then accepting the first subsequent line that looks like a data
 * row (contains a tab, doesn't start with `#`/`$`).
 */
export function parseHyperLedaMeandata(text: string): HyperLedaMeandataRow | null {
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').startsWith('$objname')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const cols = parseHeader(lines[headerIdx]!);

  // Scan for the data row.  Skip everything that isn't tab-separated
  // tabular content: comment banners (`#`), blank lines, the header
  // itself (`$`-prefixed), and trailing whitespace.
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.length === 0) continue;
    if (line.startsWith('#') || line.startsWith('$')) continue;
    if (!line.includes('\t')) continue;
    const cells = line.split('\t');
    return {
      objname: strCell(cells, cols.get('$objname')),
      pgc: strCell(cells, cols.get('pgc')),
      // `objtype` arrives as `'G '` (trailing space); strCell trims.
      objtype: strCell(cells, cols.get('objtype')),
      al2000: numCell(cells, cols.get('al2000')),
      de2000: numCell(cells, cols.get('de2000')),
      type: strCell(cells, cols.get('type')),
      logd25: numCell(cells, cols.get('logd25')),
      logr25: numCell(cells, cols.get('logr25')),
      pa: numCell(cells, cols.get('pa')),
      bt: numCell(cells, cols.get('bt')),
      e_bt: numCell(cells, cols.get('e_bt')),
      vt: numCell(cells, cols.get('vt')),
      e_vt: numCell(cells, cols.get('e_vt')),
      kt: numCell(cells, cols.get('kt')),
      e_kt: numCell(cells, cols.get('e_kt')),
      mod0: numCell(cells, cols.get('mod0')),
      e_mod0: numCell(cells, cols.get('e_mod0')),
      v3k: numCell(cells, cols.get('v3k')),
      mabs: numCell(cells, cols.get('mabs')),
    };
  }
  return null;
}

/**
 * Build the HyperLEDA meandata URL for a given object name.  Centralised
 * here so the test suite + the runtime both use the same construction
 * (and so the URL-encoding decision is in exactly one place).
 *
 * `encodeURIComponent` handles the spaces and `+` and `/` characters
 * that some object names carry (e.g. `IC 1613`, `M82A`).
 */
export function hyperLedaMeandataUrl(name: string): string {
  return `http://atlas.obs-hp.fr/hyperleda/fG.cgi?n=meandata&a=csv&o=${encodeURIComponent(name)}`;
}
