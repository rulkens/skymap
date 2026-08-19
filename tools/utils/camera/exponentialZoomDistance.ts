/**
 * exponentialZoomDistance — wheel-to-zoom scaling shared verbatim by
 * galaxy-renderer and mcpm-workbench (mcpm-workbench's own comment cites
 * matching galaxy-renderer's constant on purpose). A notch is a constant
 * RATIO of distance, not a constant step — the only zoom that feels the same
 * at 3000 units out and at 0.02. Clamping the result is the caller's job:
 * galaxy-renderer clamps inline, mcpm-workbench's `setCameraDistance` slice
 * reducer clamps downstream.
 */
export function exponentialZoomDistance(
  distance: number,
  wheelDeltaY: number,
  zoomSpeed: number,
): number {
  return distance * Math.exp(wheelDeltaY * zoomSpeed);
}
