/**
 * Build the SDSS DR18 Quick Look URL for a given object identifier.
 *
 * The Quick Look page shows an image cutout, photometric measurements, and
 * links to the spectrum — a useful "click through to see more" target from
 * the info card.
 *
 * SDSS objIDs are 64-bit unsigned integers that exceed Number's safe integer
 * limit, so we accept `bigint` to avoid silent truncation of the last digits.
 */

/**
 * Build the URL of the SDSS Quick Look page for an object.
 *
 * Opens a web page showing an image cutout, photometric measurements, and
 * links to the spectrum.
 *
 * `objID` is a 64-bit unsigned integer. We accept `bigint` here to preserve
 * full precision — SDSS objIDs are 18-digit numbers that exceed Number's
 * safe integer limit (2⁵³ ≈ 9 × 10¹⁵), so passing them as `number` would
 * silently truncate the last few digits and retrieve the wrong object.
 *
 * URL template (DR18):
 *   https://skyserver.sdss.org/dr18/VisualTools/quickobj?objId={objId}
 *
 * @param objId  The SDSS 64-bit object identifier as a bigint.
 */
export function sdssExplorerUrl(objId: bigint): string {
  return `https://skyserver.sdss.org/dr18/VisualTools/quickobj?objId=${objId}`;
}
