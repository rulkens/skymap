/**
 * Build the SDSS image cutout URL for a sky position.
 *
 * The SDSS ImgCutout service returns a square JPEG centred on any (RA, Dec)
 * coordinate at 0.4 arcsec/pixel. This URL is used in the info card to show
 * a thumbnail of the galaxy alongside its measured properties.
 *
 * The cutout service is hot-link friendly — no auth required, works directly
 * in an <img> tag with no CORS issues.
 */

/**
 * Build the URL of an SDSS image cutout — a square JPEG centred on the
 * given sky coordinates.
 *
 * The cutout service is hot-link friendly (no auth required, no CORS issues
 * for `<img>` tags). Pixel scale is fixed at 0.4 arcsec/pixel, which
 * matches the native SDSS imaging resolution.
 *
 * `sizePx` is clamped to [32, 2048] per the DR18 ImgCutout service limits.
 * The default of 160 gives a comfortable thumbnail without a large download.
 *
 * URL template (DR18):
 *   https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg
 *     ?ra={ra}&dec={dec}&scale=0.4&width={size}&height={size}
 *
 * `fovArcmin`, when given, sets the field of view: the pixel scale becomes
 * `fovArcmin × 60 / sizePx` arcsec/pixel so the cutout frames a galaxy of that
 * angular size.  Omitted, the scale stays at the native 0.4 arcsec/pixel.
 *
 * @param raDeg     Right Ascension of the centre, in decimal degrees.
 * @param decDeg    Declination of the centre, in decimal degrees.
 * @param sizePx    Width and height of the cutout in pixels. Default 160.
 *                  Clamped to [32, 2048].
 * @param fovArcmin Optional field of view in arcmin; drives the pixel scale.
 */
export function sdssThumbnailUrl(
  raDeg: number,
  decDeg: number,
  sizePx = 160,
  fovArcmin?: number,
): string {
  // Clamp to the service-documented pixel limits.
  const size = Math.max(32, Math.min(2048, sizePx));
  const scale = fovArcmin !== undefined ? (fovArcmin * 60) / size : 0.4;
  return (
    `https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg` +
    `?ra=${raDeg}&dec=${decDeg}&scale=${scale}&width=${size}&height=${size}`
  );
}
