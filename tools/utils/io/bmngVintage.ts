/**
 * `BMNG_VINTAGE` — the one place Earth's Blue Marble imagery month is chosen.
 *
 * Blue Marble Next Generation is a MONTHLY series: twelve whole-globe images,
 * all from 2004, each one a cloud-screened composite of many MODIS Terra passes
 * over that month. Every month is published twice over, as a 21600 x 10800
 * whole-globe equirect and as eight 21600 x 21600 quadrants that composite to
 * 86400 x 43200, so the vintage picks nine files at once.
 *
 * ## Why the month is a constant and not ten string literals
 *
 * Earth's whole-globe base texture is built from the equirect; the surface tile
 * pyramid is baked from the quadrants; and the tile layer falls back to the base
 * wherever it has no tile, which is everywhere outside the baked level range and
 * anywhere the atlas runs out of slots. Two different months across that
 * boundary puts a snow line and a vegetation change exactly at the frontier the
 * feature exists to make inspectable. The two halves therefore MUST share a
 * month, and the only way to state that as a fact rather than as a rule someone
 * has to remember is for both to read the month from here.
 *
 * The three fields are three encodings of the same month (the filename stamp,
 * the collection URL's lowercase segment, and the prose label attribution
 * strings carry), so they have to be changed together; keeping them adjacent in
 * one small module is what makes that a single legible edit. Switching vintage
 * is then: edit these three, re-run `fetch-textures`, `build-textures` and
 * `build-earth-tiles`.
 */

export const BMNG_VINTAGE = {
  /** `YYYYMM` stamp embedded in every BMNG filename. */
  stamp: '200408',

  /**
   * Directory the NASA collection publishes this month under. Written out in
   * full rather than assembled from a month slug so the URL stays greppable
   * against the provenance README and a browser address bar.
   */
  baseUrl:
    'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/august/',

  /** Human-readable vintage for attribution strings and the tile manifest. */
  label: 'August 2004',
} as const;
