/**
 * FilamentCloud — the runtime decoded shape of `filaments.bin`.
 *
 * Mirrors the SoA layout of `PointCloud`: separate typed arrays for each
 * field so we can `device.queue.writeBuffer` them straight to the GPU
 * without per-strip allocations.
 *
 * The `stripOffsets` table preserves filament boundaries so the renderer
 * can iterate per-strip when building instance buffers.  Total
 * vertices live in a single flat `Float32Array` of length 4 × vertexCount
 * (interleaved xyz + density) so the GPU upload is a single writeBuffer
 * call.
 */
export type FilamentCloud = {
  /** Number of filament polylines. */
  stripCount: number;
  /** Total vertices across all strips. */
  vertexCount: number;
  /**
   * For strip i, vertices are stored at
   *   `vertices[stripOffsets[i] * 4 .. stripOffsets[i+1] * 4]`
   * stripOffsets has length stripCount + 1; the last entry equals
   * vertexCount so "next strip" lookups don't need a bounds check.
   */
  stripOffsets: Uint32Array;
  /**
   * Interleaved per-vertex data: [x, y, z, density, x, y, z, density, ...]
   * Length = vertexCount * 4.  Density is in [0, 1] (normalised at encode
   * time); Phase 1 ignores it in the shader.
   */
  vertices: Float32Array;
};
