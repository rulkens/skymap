/**
 * galaxyCacheKey — stable per-galaxy key for the atlas slot + load-fade maps,
 * derived from sky position (RA/Dec rounded to 5 decimal places).
 *
 * Position, not catalog index: a galaxy keeps the same key across tier switches
 * and re-decimations even though its array index changes, so its fetched
 * thumbnail and load-fade timing survive. 5 dp (~0.36 arcsec) is finer than any
 * two distinct catalog galaxies, so collisions don't happen in practice.
 *
 * Shared by both disk planners (the textured planner writes the atlas/fade maps,
 * the procedural planner reads atlas membership for its famous-WebP crossfade),
 * so the key formula lives here rather than in one of them.
 */
export function galaxyCacheKey(ra: number, dec: number): string {
  return `${ra.toFixed(5)}_${dec.toFixed(5)}`;
}
