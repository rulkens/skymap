/**
 * Build a Digitized Sky Survey (DSS) image cutout URL for a given (RA, Dec).
 *
 * DSS is all-sky (originally photographic plates from Palomar/UK Schmidt),
 * unlike SDSS which only covers ~1/3 of the sky.  We use DSS as the
 * thumbnail fallback for galaxies sourced from non-SDSS catalogs (2MRS,
 * GLADE) where the SDSS cutout service would return blank sky or 404.
 *
 * Endpoint: ESO archive's DSS proxy.  Returns a JPEG.  `arcMin` is the
 * field-of-view side length in arcminutes; 2 is a reasonable default for
 * a typical galaxy at 50–500 Mpc (apparent size ≈ 1–5 arcmin).
 */
export function dssThumbnailUrl(raDeg: number, decDeg: number, arcMin = 2): string {
  return (
    `https://archive.eso.org/dss/dss/image?ra=${raDeg}&dec=${decDeg}` +
    `&x=${arcMin}&y=${arcMin}&Sky-Survey=DSS2-red&mime-type=image/jpeg`
  );
}
