/**
 * exponentialZoomDistance — wheel-to-zoom scaling shared verbatim by
 * galaxy-renderer and mcpm-workbench. A notch is a constant RATIO of
 * distance, not a constant step — the only zoom that feels the same at 3000
 * units out and at 0.02. Clamping the result is the caller's own job.
 */
export function exponentialZoomDistance(
  distance: number,
  wheelDeltaY: number,
  zoomSpeed: number,
): number {
  return distance * Math.exp(wheelDeltaY * zoomSpeed);
}
