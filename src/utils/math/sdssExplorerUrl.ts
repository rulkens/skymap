/**
 * Build the SDSS DR18 Explore-tool "Summary" URL for a given object identifier.
 *
 * The Explore Summary page is the canonical object page: it shows the image
 * and spectrum, a summary of the photometric + spectroscopic measurements, and
 * cross-survey links — a useful "click through to see more" target from the
 * info card.  We target Explore rather than the lightweight Quick Look
 * (`quickobj`) endpoint, which returns a server error for some objIds.
 *
 * `objId` is a 64-bit unsigned integer. We accept `bigint` to preserve full
 * precision — SDSS objIDs are 18-digit numbers that exceed Number's safe
 * integer limit (2⁵³ ≈ 9 × 10¹⁵), so passing them as `number` would silently
 * truncate the last few digits and retrieve the wrong object.
 *
 * URL template (DR18):
 *   https://skyserver.sdss.org/dr18/VisualTools/explore/summary?objId={objId}
 */
export function sdssExplorerUrl(objId: bigint): string {
  return `https://skyserver.sdss.org/dr18/VisualTools/explore/summary?objId=${objId}`;
}
