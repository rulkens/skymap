/**
 * Build a NED `byname` URL for an object designation.
 *
 * NED (NASA/IPAC Extragalactic Database) is the canonical public-facing
 * extragalactic catalogue: it indexes basically every galaxy that's been
 * mentioned in a paper or detected by a major survey, and aggregates
 * redshifts, photometry, morphology, and references onto a single page
 * per object.  We use it as the universal "catalogue page" target for
 * non-SDSS rows in the InfoCard.  Routed through NED rather than
 * HyperLEDA / SIMBAD for coverage: NED indexes the deep WISE/2MASS layers
 * that GLADE rides on top of, including faint distant galaxies that drop
 * out of HyperLEDA's PGC-only database.
 *
 * The `byname` endpoint resolves a designation directly to its object
 * page — best when we have a real catalogue name (PGC number, 2MASX
 * designation, NGC name for famous galaxies).  NED accepts a wide variety
 * of catalogue prefixes — common ones include `PGC <n>`, `NGC <n>`,
 * `M<n>`, and `2MASX J<RA><Dec>` — and falls through to a "name not
 * resolved" page when the input doesn't match any known object.  For
 * coordinate-only rows use `nedNearPositionUrl` instead.
 *
 * The name is URL-encoded; spaces become `+` (not `%20`) per NED's URL
 * conventions.
 *
 * @param name  Catalogue designation, e.g. "PGC 12345" or
 *              "2MASX J012345.67-891234.5".
 */
export function nedByNameUrl(name: string): string {
  // Replace spaces with `+` BEFORE encodeURIComponent so the `+`
  // survives encoding (encodeURIComponent leaves `+` alone).  Doing
  // it the other way around would yield `%20`, which NED accepts
  // but which renders less cleanly in copy-paste contexts.
  const slug = encodeURIComponent(name.trim().replace(/\s+/g, '+')).replace(/%2B/g, '+');
  return `https://ned.ipac.caltech.edu/byname?objname=${slug}`;
}
