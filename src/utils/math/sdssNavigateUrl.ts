/**
 * Build the SDSS DR18 "Navigate" URL for a sky position — the external 2D
 * sky viewer opened when a user clicks an InfoCard thumbnail for an SDSS row.
 *
 * URL template (DR18):
 *   https://skyserver.sdss.org/dr18/VisualTools/navi?ra={ra}&dec={dec}&scale={scale}
 *
 * `fovArcmin` is the same field-of-view the thumbnail cutout was framed at;
 * `scale` (arcsec/pixel) is derived from it so Navigate opens showing
 * roughly the same patch of sky as the thumbnail.
 */

/**
 * Build the URL of the SDSS Navigate viewer, framed to match a given field
 * of view.
 *
 * @param raDeg     Right Ascension of the centre, in decimal degrees.
 * @param decDeg    Declination of the centre, in decimal degrees.
 * @param fovArcmin Field of view (thumbnail framing) in arcminutes.
 */
export function sdssNavigateUrl(raDeg: number, decDeg: number, fovArcmin: number): string {
  // Navigate's viewport is a fixed 512×512 px image regardless of window
  // size — the service has no separate width/height params like ImgCutout,
  // so this constant is the only lever for matching the thumbnail's framing.
  const NAVIGATE_VIEWPORT_PX = 512;
  const scale = (fovArcmin * 60) / NAVIGATE_VIEWPORT_PX;
  return `https://skyserver.sdss.org/dr18/VisualTools/navi?ra=${raDeg}&dec=${decDeg}&scale=${scale}`;
}
