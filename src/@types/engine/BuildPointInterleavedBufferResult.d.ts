/** Output of the bake; the store copies `interleaved` into the GPU vertex buffer. */
export type BuildPointInterleavedBufferResult = {
  /** Interleaved per-vertex bytes — see `SLOTS_PER_GALAXY_POINT` in galaxyPointVertexLayout.ts. */
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
};
