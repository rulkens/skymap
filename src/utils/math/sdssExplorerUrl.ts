/**
 * Build the SDSS DR18 "Quick Look" URL for a given object identifier.
 *
 * Quick Look (`quickobj`) is the lightweight single-object page: image,
 * spectrum, and the headline photometric + spectroscopic measurements — a
 * useful "click through to see more" target from the info card without the
 * weight of the full Explore tool.
 *
 * `objId` is a 64-bit unsigned integer. We accept `bigint` to preserve full
 * precision — SDSS objIDs are 18-digit numbers that exceed Number's safe
 * integer limit (2⁵³ ≈ 9 × 10¹⁵), so passing them as `number` would silently
 * truncate the last few digits and retrieve the wrong object.
 *
 * URL template (DR18):
 *   https://skyserver.sdss.org/dr18/VisualTools/quickobj?objId={objId}
 */
export function sdssExplorerUrl(objId: bigint): string {
  return `https://skyserver.sdss.org/dr18/VisualTools/quickobj?objId=${objId}`;
}
