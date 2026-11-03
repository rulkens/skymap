import { paddedRadiusMpc } from '../../paddedRadiusMpc';

/**
 * diskQuadExtentMpc — full world-space extent of a galaxy's disk quad.
 *
 * `paddedRadiusMpc` gives the disk's padded *radius* in Mpc; the disk quad's
 * `posSize.w` slot stores the FULL extent because the vertex stage halves it
 * back to a radius at corner expansion. So the planners emit `radius · 2`.
 *
 * Both disk planners (procedural LOD-1, textured LOD-2) compute this identically
 * per emitted row; this is the one home for the "store the full extent, not the
 * radius" contract so it can't drift between them.
 */
export function diskQuadExtentMpc(diameterKpc: number): number {
  return paddedRadiusMpc(diameterKpc) * 2;
}
