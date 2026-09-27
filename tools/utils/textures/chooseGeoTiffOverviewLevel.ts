/**
 * chooseGeoTiffOverviewLevel — the coarsest pyramid level (see
 * `geoTiffOverviewLevels`) whose own width/height still meet a caller's
 * required minimum, so a downsampled read decodes as few source pixels as
 * the output needs rather than always the native level. `required*` is
 * expressed in the SAME units as `levels[0]` (typically "what the full
 * raster's width/height would need to be for this box's window to carry
 * the output's pixel count" — the caller derives that from its own box
 * fraction, not from the output size directly).
 */
export function chooseGeoTiffOverviewLevel(
  levels: ReadonlyArray<{ readonly width: number; readonly height: number }>,
  requiredWidth: number,
  requiredHeight: number,
): number {
  let chosen = 0;
  for (let level = 1; level < levels.length; level++) {
    const candidate = levels[level]!;
    if (candidate.width >= requiredWidth && candidate.height >= requiredHeight) chosen = level;
  }
  return chosen;
}
