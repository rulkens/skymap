/**
 * Brightness stratification knobs: a record lives at
 * `L(M) = round(log2(refUnit·10^((mLim − M)/5)·thr / cellEdge))`, clamped to the grid.
 */
export type OctreeStratify = {
  /** The cut's refine threshold (box edge over distance). */
  readonly thr: number;
  /** Absolute magnitude that resolves at `refUnit`. */
  readonly mLim: number;
  /** Reference distance in the catalog unit (pc for stars). */
  readonly refUnit: number;
};
