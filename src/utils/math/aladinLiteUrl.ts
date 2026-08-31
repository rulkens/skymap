/**
 * Build the Aladin Lite URL for a sky position — the external 2D sky viewer
 * opened when a user clicks an InfoCard thumbnail for a non-SDSS row.
 *
 * `survey=CDS/P/DSS2/color` deliberately matches the HiPS survey
 * `dssThumbnailUrl` uses for the DSS thumbnails themselves, so the viewer
 * opens on the same imagery the user just saw in the card.
 */

/**
 * Build the URL of the Aladin Lite viewer, framed to match a given field of
 * view.
 *
 * @param raDeg     Right Ascension of the centre, in decimal degrees.
 * @param decDeg    Declination of the centre, in decimal degrees.
 * @param fovArcmin Field of view (thumbnail framing) in arcminutes.
 */
export function aladinLiteUrl(raDeg: number, decDeg: number, fovArcmin: number): string {
  // DSS2 is only ~1 arcsec/px native, so a thumbnail-sized FOV (often a few
  // arcmin) upscales far past native in a full-screen viewport and looks
  // blurry. Floor the FOV so small galaxies open zoomed out near native
  // resolution; larger framings pass through unchanged.
  const MIN_FOV_ARCMIN = 30;
  // Aladin Lite wants `fov` in degrees; the thumbnail framing is arcmin.
  const fovDeg = Math.max(fovArcmin, MIN_FOV_ARCMIN) / 60;
  return (
    `https://aladin.cds.unistra.fr/AladinLite/` +
    `?target=${raDeg}%20${decDeg}` +
    `&fov=${fovDeg}` +
    `&survey=${encodeURIComponent('CDS/P/DSS2/color')}`
  );
}
