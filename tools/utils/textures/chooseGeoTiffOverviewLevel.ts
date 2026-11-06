/**
 * chooseGeoTiffOverviewLevel — the coarsest pyramid level (see
 * `geoTiffOverviewLevels`) whose own width/height still meet a caller's
 * required minimum, so a downsampled read decodes as few source pixels as
 * the output needs rather than always the native level. `required*` is
 * expressed in the SAME units as `levels[0]` (the full raster's size needed
 * for the box's window to carry the output's pixel count).
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
