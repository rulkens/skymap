/**
 * Shared types for the renderer.
 *
 * The whole pipeline (synthetic generator, .bin loader, GPU uploader) speaks
 * one shape: `PointCloud`. Picking a single representation early avoids
 * conversions in hot paths and keeps the GPU upload code simple.
 */

/**
 * A point cloud in renderer-ready layout — a "struct of arrays" rather than
 * an array of objects.
 *
 * Why SoA? Two reasons:
 *   1. Float32Array maps directly onto a GPU buffer with `device.queue.writeBuffer`,
 *      no per-point object allocation, no per-point copy work.
 *   2. CPUs and GPUs both prefer contiguous typed memory; a million `{x,y,z}`
 *      JS objects would blow up the heap and stall on garbage collection.
 *
 * All distance units are megaparsecs (Mpc) — the natural unit at SDSS scales.
 * 1 Mpc ≈ 3.26 million light-years.
 */
export type PointCloud = {
  /** Number of points. The three Float32Arrays below derive their length from this. */
  count: number;

  /**
   * Interleaved xyz coordinates in Mpc — length === count * 3.
   * Layout: [x0, y0, z0, x1, y1, z1, ...].
   */
  positions: Float32Array;

  /**
   * Apparent magnitude per point — length === count.
   *
   * Astronomical magnitude is a logarithmic, *inverted* brightness scale:
   * smaller numbers = brighter objects. Sun ≈ -26, Vega ≈ 0, faintest SDSS
   * galaxies ≈ 22. The shader maps this to point intensity.
   */
  magnitudes: Float32Array;

  /**
   * Color index (e.g. SDSS u−g) per point — length === count.
   *
   * "Color index" in astronomy is the magnitude difference between two
   * filters. Bluer/hotter objects have smaller u−g; redder/cooler have larger.
   * The shader maps this to a blue→white→red color ramp.
   */
  colorIndex: Float32Array;
};
