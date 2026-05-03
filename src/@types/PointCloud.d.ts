/**
 * PointCloud — the single renderer-ready data shape shared by the synthetic
 * generator, the .bin loader, and the GPU upload path. Uses a struct-of-arrays
 * layout so each typed array can be passed straight to `writeBuffer`.
 */

/**
 * A point cloud in renderer-ready layout — a "struct of arrays" rather than
 * an array of objects.
 *
 * Why SoA? Two reasons:
 *   1. Float32Array (and BigUint64Array) map directly onto GPU buffers via
 *      `device.queue.writeBuffer`, no per-point object allocation or copy work.
 *   2. CPUs and GPUs both prefer contiguous typed memory; a million `{x,y,z}`
 *      JS objects would blow up the heap and stall on garbage collection.
 *
 * Why separate arrays per magnitude band rather than a single 2D array?
 *   Typed-array views are the cheapest path to the GPU: we can pass each
 *   band's Float32Array straight to `writeBuffer` without any per-frame
 *   restructuring. A 2D array or interleaved layout would require a copy (or
 *   a non-trivial strided upload) every time we change which band to display.
 *
 * All distance units are megaparsecs (Mpc) — the natural unit at SDSS scales.
 * 1 Mpc ≈ 3.26 million light-years.
 */
export type PointCloud = {
  /** Number of points. All typed arrays below derive their length from this. */
  count: number;

  /**
   * SDSS object identifiers — length === count.
   *
   * SDSS objIDs are 64-bit unsigned integers that encode the sky tile,
   * run/rerun/camcol/field, and object number. They are used to construct
   * image-cutout and Explorer URLs. We store them as `BigUint64Array` because
   * JavaScript's `number` type is a 64-bit float and can only represent
   * integers exactly up to 2^53 — SDSS objIDs regularly exceed that.
   *
   * For synthetic data `objIDs[i] = BigInt(i)` (sequential 0..N-1); those
   * values won't resolve to real SDSS images, but the field is always present
   * so the renderer code path is uniform.
   */
  objIDs: BigUint64Array;

  /**
   * Interleaved xyz coordinates in Mpc — length === count * 3.
   * Layout: [x0, y0, z0, x1, y1, z1, ...].
   */
  positions: Float32Array;

  /**
   * SDSS u-band (ultraviolet) model magnitude per point — length === count.
   *
   * Astronomical magnitude is a logarithmic, *inverted* brightness scale:
   * smaller numbers = brighter objects. Combined with magG, the u−g color
   * index indicates star-forming (blue, low u−g) vs. quiescent (red, high u−g)
   * galaxies.
   */
  magU: Float32Array;

  /**
   * SDSS g-band (green) model magnitude per point — length === count.
   *
   * The g-band is the primary brightness indicator used by the renderer.
   * Range in the SDSS main sample is roughly 14 (brightest) to 22 (faintest).
   */
  magG: Float32Array;

  /**
   * SDSS r-band (red) model magnitude per point — length === count.
   *
   * Typically ≈0.3–1.3 mag fainter than g (i.e. numerically smaller than g
   * since magnitudes are inverted). Used for future multi-band color analysis.
   */
  magR: Float32Array;

  /**
   * SDSS i-band (near-infrared) model magnitude per point — length === count.
   *
   * Typically ≈0.0–0.6 mag fainter than r. Useful for stellar population
   * diagnostics at low redshift.
   */
  magI: Float32Array;

  /**
   * SDSS z-band (far near-infrared) model magnitude per point — length === count.
   *
   * Typically ≈0.0–0.4 mag fainter than i. The reddest of the five standard
   * SDSS photometric bands.
   */
  magZ: Float32Array;

  /**
   * Per-galaxy axis ratio b/a — length === count.
   *
   * The minor-to-major axis ratio of the galaxy's elliptical isophote on the
   * sky, in [0, 1]. A value near 1 means a face-on disk or round elliptical;
   * a value near 0 means an edge-on disk seen as a thin sliver. Combined with
   * `positionAngleDeg`, this drives the on-screen orientation of the disk
   * billboards introduced in the galaxy-orientation-disks plan.
   *
   * NaN is a legitimate sentinel meaning "no measurement available". The
   * build pipeline normally fills every entry — either with a real
   * cross-matched value, or with a deterministic fallback — but the binary
   * format itself preserves NaN faithfully so the encoder/decoder remain
   * pure and unit-testable independent of how the cloud was populated.
   */
  axisRatio: Float32Array;

  /**
   * Per-galaxy position angle in degrees — length === count.
   *
   * Astronomical convention: measured east of north on the sky, in the range
   * [0, 180). This is the orientation of the major axis of the galaxy's
   * isophote. Pairs with `axisRatio` to define the projected disk shape.
   *
   * NaN means "no measurement available" — same semantics as `axisRatio`.
   */
  positionAngleDeg: Float32Array;

  /**
   * Per-galaxy physical diameter in kiloparsecs — length === count.
   *
   * Drives the renderer's apparent-size math, the thumbnail quad's
   * world-space footprint, the 3D disk plane's geometry, and the focus
   * tween distance.  The build pipeline guarantees every entry is a
   * finite, positive value: real catalog measurement when the parser
   * supplied one, otherwise DEFAULT_GALAXY_DIAMETER_KPC = 30.
   *
   * Unlike `axisRatio`/`positionAngleDeg`, NaN is never a legitimate
   * decoded value here — the renderer multiplies and divides by this
   * field every frame and a NaN would turn the entire billboard black.
   * The encoder still preserves NaN bit-for-bit (it's a pure function
   * of the input cloud), but the pipeline never produces a NaN entry.
   */
  diameterKpc: Float32Array;
};
