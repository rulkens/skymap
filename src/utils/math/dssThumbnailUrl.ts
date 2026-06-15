/**
 * Build a Digitized Sky Galaxy catalog (DSS) image cutout URL for a given (RA, Dec).
 *
 * DSS is all-sky (originally photographic plates from Palomar/UK Schmidt),
 * unlike SDSS which only covers ~1/3 of the sky.  We use DSS as the
 * thumbnail fallback for galaxies sourced from non-SDSS catalogs (2MRS,
 * GLADE) where the SDSS cutout service would return blank sky or 404.
 *
 * ### Why CDS hips2fits and not e.g. ESO's `archive.eso.org/dss/dss/image`?
 *
 * ESO's DSS endpoint serves the same plate data and has a slightly simpler
 * URL shape, but it does NOT include `Access-Control-Allow-Origin` in its
 * response headers.  That means a browser `fetch()` is blocked by CORS,
 * the response can't be decoded into an `ImageBitmap`, and the texture-
 * atlas upload (`copyExternalImageToTexture`) refuses tainted bitmaps
 * outright.  The CDS Aladin team explicitly designed `hips2fits` for
 * web-app use and it advertises CORS, so the browser can decode it.
 *
 * The HiPS data hosted by CDS is the same DSS2 imagery — just served via
 * the HiPS multi-resolution tile system rather than the original on-the-
 * fly cutout.  Visually indistinguishable for our 128×128 thumbnails.
 *
 * We request the `CDS/P/DSS2/color` composite (blue + red plates) rather
 * than the monochrome `CDS/P/DSS2/red` plate so non-SDSS galaxies (2MRS,
 * GLADE, and famous-galaxy fallbacks) get a colour InfoCard thumbnail
 * instead of a grey one.  Both layers cover the full sky and share the
 * same hips2fits CORS support, so this is a drop-in upgrade.
 *
 * Reference: https://aladin.cds.unistra.fr/hips/HipsImageList.html
 *
 * `arcMin` is the field-of-view side length in arcminutes; 2 is a
 * reasonable default for a typical galaxy at 50–500 Mpc (apparent size
 * ≈ 1–5 arcmin).  `sizePx` is the rendered output size in pixels — fixed
 * at 128 to match the texture atlas's slot size so the atlas doesn't
 * have to resize on upload.
 */
export function dssThumbnailUrl(raDeg: number, decDeg: number, arcMin = 2): string {
  // hips2fits wants `fov` in degrees and a separate width/height in pixels.
  // We convert arcmin → degrees here so callers can keep using arcmin
  // (the natural astronomical unit for galaxy field-of-view).
  const fovDeg = arcMin / 60;
  const sizePx = 128;
  return (
    `https://alasky.cds.unistra.fr/hips-image-services/hips2fits` +
    `?hips=${encodeURIComponent('CDS/P/DSS2/color')}` +
    `&ra=${raDeg}&dec=${decDeg}` +
    `&fov=${fovDeg}&width=${sizePx}&height=${sizePx}&format=jpg`
  );
}
