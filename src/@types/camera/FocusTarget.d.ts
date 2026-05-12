/**
 * FocusTarget — discriminated union representing a parsed focus target
 * from the `#focus=<id>` URL hash codec.
 *
 * The codec is intentionally lossless on `kind`, but the resolver
 * downstream (see `resolveFocusTarget`) is what turns this into a
 * concrete `(source, localIdx)` pair against the loaded clouds.
 *
 * Field naming: `raDeg`/`decDeg` (vs. `PointInfo`'s `ra`/`dec`) is
 * deliberate.  The codec is far from `PointInfo` and the unit suffix
 * makes the contract self-documenting at every callsite.
 *
 * The id formats mirror the priority ladder used elsewhere in the
 * project for "what name does this galaxy go by":
 *
 *   m31              — famous-catalog seed id (stable across rebuilds)
 *   pgc-2789         — any source with a real PGC number we trust
 *                      (PGC = Principal Galaxies Catalog, maintained by
 *                      HyperLEDA; widely cross-indexed by NED/SIMBAD)
 *   sdss-<objID>     — SDSS row whose objID is the canonical handle
 *                      (19-digit bigint, exceeds JS Number safe range)
 *   pos@<ra>,<dec>   — fallback for 2MRS/GLADE rows without a PGC
 */

export type FocusTarget =
  | { kind: 'famous'; id: string }
  | { kind: 'pgc'; pgc: bigint }
  | { kind: 'sdss'; objID: bigint }
  | { kind: 'pos'; raDeg: number; decDeg: number };
