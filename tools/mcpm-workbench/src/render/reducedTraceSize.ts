/**
 * reducedTraceSize — `floor(size / divisor)`, min 1 px. Mirrors
 * `src/services/gpu/renderTargets.ts`'s `allocate()`: floor matches the
 * upsample shader's sample-at-uv semantics, and the min-1 clamp guards a
 * canvas smaller than the divisor from producing an illegal 0-dimension
 * texture (RenderGraph's offscreen trace target, drawTracePass).
 */
export function reducedTraceSize(
  width: number,
  height: number,
  divisor: number,
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, Math.floor(width / divisor)),
    height: Math.max(1, Math.floor(height / divisor)),
  };
}
