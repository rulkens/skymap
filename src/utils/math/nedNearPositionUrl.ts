/**
 * Build a NED near-position search URL at the given equatorial
 * coordinates (J2000).
 *
 * The coordinate-only fallback to `nedByNameUrl`: when we have only
 * coords (e.g. a GLADE row whose source line had a blank/sentinel PGC),
 * this returns a results table of objects within a cone, sorted by
 * distance to the search centre.  The user lands on the table and clicks
 * the closest result through to its full object page — one extra click
 * vs. a direct name hit, but always resolves *something* the row
 * corresponds to.  See `nedByNameUrl` for why we route through NED.
 *
 * Search radius is fixed at 0.5 arcmin: large enough to absorb the
 * astrometric scatter between GLADE and NED's own positions (typically
 * ~1″), small enough that genuinely distinct nearby galaxies don't
 * pollute the result set.
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
