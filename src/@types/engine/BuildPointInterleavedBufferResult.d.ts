import type { SchechterTriple } from '../data/galaxyCatalog/SchechterTriple';

/**
 * Output of the bake.  The renderer copies `interleaved` into the GPU
 * vertex buffer and stashes the rest on the per-source bookkeeping so
 * `draw()` can populate the global uniform without redoing the integral.
 */
export type BuildPointInterleavedBufferResult = {
  /** Interleaved per-vertex bytes — see `SLOTS_PER_GALAXY_POINT` in galaxyPointRenderer.ts. */
  interleaved: Float32Array;
  /**
   * Parallel per-row copy of the cloud's persisted `orientationIsFallback`
   * flag (1 = the row's orientation is a deterministic fallback, not a
   * measurement).  Used inside the bake to encode the flag into the sign bit
   * of axisRatio (slot 5); also exposed so callers and tests can read which
   * rows are fallback without touching the cloud.  Sourced from the
   * authoritative persisted byte, never re-hashed.
   */
  isFallbackArr: Uint8Array;
  /** Schechter LF triple `(M*, α, φ*)` for this galaxy catalog's selection band. */
  schechter: SchechterTriple;
  /** Galaxy catalog apparent-magnitude flux limit (e.g. SDSS = 17.77). */
  mLim: number;
  /** Pre-computed central-density normaliser N_ref = n(d = 10 Mpc). */
  nRef: number;
};
