import type { OctreeGrid } from '../../src/@types/octree/OctreeGrid';
import type { OctreeStratify } from '../../src/@types/octree/OctreeStratify';

/**
 * The level a record's brightness earns. A level-L box refines inside `cellEdge·2^L / thr`;
 * setting that equal to `d_res(M) = refUnit·10^((mLim − M)/5)`, the distance where M reaches
 * mLim, gives `L(M) = log2(d_res·thr / cellEdge)`.
 */
export function levelForMagnitude(
  absMag: number,
  stratify: OctreeStratify,
  grid: Pick<OctreeGrid, 'bits' | 'cellEdge'>,
): number {
  const dRes = stratify.refUnit * 10 ** ((stratify.mLim - absMag) / 5);
  const level = Math.round(Math.log2((dRes * stratify.thr) / grid.cellEdge));
  return Math.min(Math.max(level, 0), grid.bits);
}
