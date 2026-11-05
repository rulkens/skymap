/**
 * Body-sphere tessellation for `uvSphereMesh(segments, rings)`. `starRenderer`
 * DRAWS the mesh; the analytic renderers (`planetRenderer`, `texturedBodyRenderer`,
 * `bodyPickRenderer`) use it as a proxy shell inflated by `PROXY_SCALE`
 * (`analyticSphere.wesl`). An inscribed UV sphere falls short of the true circle
 * by `1 - cos(half-step)` (0.214% at 48x24, ~0.43% near a facet diagonal), the
 * floor `PROXY_SCALE` must clear. `Uint16Array` indices cap counts near 256x128.
 * The atmosphere and cloud shells keep their own 128x64 constants.
 */

/** Longitude slices around the equator. */
export const BODY_SPHERE_SEGMENTS = 48;

/** Latitude bands from pole to pole. */
export const BODY_SPHERE_RINGS = 24;
