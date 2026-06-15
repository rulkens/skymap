import type { SchechterTriple } from '../data/SchechterTriple';

/**
 * Output of the bake.  The renderer copies `interleaved` into the GPU
 * vertex buffer and stashes the rest on the per-source bookkeeping so
 * `draw()` can populate the global uniform without redoing the integral.
 */
export type BuildPointInterleavedBufferResult = {
  /** Interleaved per-vertex bytes — see `SLOTS_PER_POINT` in pointRenderer.ts. */
  interleaved: Float32Array;
  /**
   * Parallel per-row flag set when the row's (axisRatio, positionAngleDeg)
   * exactly equals the deterministic fallback for that row.  Used inside
   * the bake to encode the fallback flag into the sign bit of axisRatio
   * (slot 6); also exposed so callers and tests can assert which rows the
   * bake classified as fallback without re-running the hash.
   */
  isFallbackArr: Uint8Array;
  /** Schechter LF triple `(M*, α, φ*)` for this galaxy catalog's selection band. */
  schechter: SchechterTriple;
  /** Galaxy catalog apparent-magnitude flux limit (e.g. SDSS = 17.77). */
  mLim: number;
  /** Pre-computed central-density normaliser N_ref = n(d = 10 Mpc). */
  nRef: number;
};
