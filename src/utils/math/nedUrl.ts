/**
 * NED (NASA/IPAC Extragalactic Database) URL builders.
 *
 * NED is the canonical public-facing extragalactic catalogue: it
 * indexes basically every galaxy that's been mentioned in a paper or
 * detected by a major survey, and aggregates redshifts, photometry,
 * morphology, and references onto a single page per object.  We use
 * it as the universal "catalogue page" target for non-SDSS rows in
 * the InfoCard.
 *
 * Two endpoints are useful here:
 *
 *   - **byname** — `/byname?objname=<name>`.  Resolves a designation
 *     directly to its object page.  Works well when we have a
 *     real catalogue name (PGC number, 2MASX designation, NGC name
 *     for famous galaxies).
 *
 *   - **near-position search** — `/cgi-bin/nph-objsearch?…`.  Returns
 *     a results table of objects within a cone, sorted by distance to
 *     the search centre.  We use this as a fallback when we have only
 *     coords (e.g. a GLADE row whose source line had a blank PGC).
 *     The user lands on the results table and clicks through to the
 *     object page — one extra click vs. a direct hit, but always
 *     resolves *something* the row corresponds to.
 *
 * Why route through NED rather than HyperLEDA / SIMBAD?  Coverage:
 * NED indexes the deep WISE/2MASS layers that GLADE rides on top
 * of, including faint distant galaxies that drop out of HyperLEDA's
 * PGC-only database.  Verified empirically on a sample GLADE row
 * (z=0.166, no HyperLEDA entry, full NED page).
 */

/**
 * Build a NED `byname` URL for an object designation.
 *
 * The resulting URL opens the canonical object page for the given
 * designation in a new tab.  NED accepts a wide variety of catalogue
 * prefixes — common ones include `PGC <n>`, `NGC <n>`, `M<n>`, and
 * `2MASX J<RA><Dec>` — and falls through to a "name not resolved"
 * page when the input doesn't match any known object.
 *
 * The name is URL-encoded; spaces become `+` (not `%20`) per NED's
 * URL conventions.
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

/**
 * Build a NED near-position search URL at the given equatorial
 * coordinates (J2000).
 *
 * Lands the user on a 1-row-or-so results table sorted by distance
 * to the search centre; clicking the closest result opens its full
 * object page.  Suitable for any row where we can't construct a
 * resolvable name — typically a GLADE row whose source line had a
 * sentinel PGC.
 *
 * Search radius is fixed at 0.5 arcmin: large enough to absorb the
 * astrometric scatter between GLADE and NED's own positions
 * (typically ~1″), small enough that genuinely distinct nearby
 * galaxies don't pollute the result set.
 *
 * @param raDeg   Right ascension in decimal degrees, [0, 360).
 * @param decDeg  Declination in decimal degrees, [-90, +90].
 */
export function nedNearPositionUrl(raDeg: number, decDeg: number): string {
  const params = new URLSearchParams({
    in_csys: 'Equatorial',
    in_equinox: 'J2000.0',
    lon: `${raDeg.toFixed(6)}d`,
    lat: `${decDeg.toFixed(6)}d`,
    radius: '0.5',
    search_type: 'Near Position Search',
    obj_sort: 'Distance to search center',
  });
  return `https://ned.ipac.caltech.edu/cgi-bin/nph-objsearch?${params.toString()}`;
}
