/**
 * resolvesToSphere — the star LOD partition: a star renders as a foreground
 * SPHERE (`starSpheresLayer`) once its apparent size crosses a threshold, and
 * as an additive backdrop POINT (`starPointsLayer`) below it. This is the same
 * "point when far, resolved when near" promotion galaxies use for their
 * point→thumbnail gate — a star's apparent size drives presentation exactly as
 * a galaxy's does.
 *
 * WHY downstream of `apparentSizePx`: the projection math (physical diameter +
 * distance + fov → pixels) already lives in `apparentSizePx.ts` and is tested
 * there. Taking the already-computed size here — rather than a camera and a
 * body record — keeps this predicate a pure threshold comparison that unit-tests
 * headlessly, with no projection or scene to stand up. The caller composes the
 * two: `resolvesToSphere({ apparentSizePx: apparentSizePx({…}), … })`.
 *
 * WHY a boolean predicate and not a table: this is a strict 2-way point/sphere
 * split. A tagged-union dispatch table earns its keep at 3+ branches; for a
 * single either/or it would be over-engineering (simplicity.md §7).
 *
 * The comparison is `>=`, so exactly-at-threshold resolves to a sphere. That
 * matches the famous-galaxy promotion gate (`produceFamousGalaxyLabels.ts:221`, which
 * skips with `sizePx < threshold → continue`), keeping the two LOD gates'
 * boundary conventions identical.
 */
export function resolvesToSphere(input: {
  apparentSizePx: number;
  thresholdPx: number;
  /**
   * Degenerate-case override — the camera sitting exactly ON the star
   * (distance 0), where the apparent-size guard returns 0 and a bare size
   * test would demote a star the camera is inside.
   */
  alwaysResolved: boolean;
}): boolean {
  const { apparentSizePx, thresholdPx, alwaysResolved } = input;
  return alwaysResolved || apparentSizePx >= thresholdPx;
}
