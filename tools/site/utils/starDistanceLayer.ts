/**
 * The distance layer of a star `distPc` away: layer 0 is everything nearer than `nearestEdgePc`, and each layer
 * after it spans twice the distances of the one before (25–50 pc, 50–100 pc, …), so neighbouring layers' parallax
 * differs by about half. The last layer takes everything beyond.
 */
export function starDistanceLayer(distPc: number, nearestEdgePc: number, layerCount: number): number {
  if (distPc < nearestEdgePc) return 0;
  return Math.min(layerCount - 1, 1 + Math.floor(Math.log2(distPc / nearestEdgePc)));
}
