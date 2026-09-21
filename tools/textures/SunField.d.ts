import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/** A fitted (or manual) sun-direction field: `g`, a 2-vector per post, over a
 *  plain equirect raster — `width × height` posts spanning `bounds`, post
 *  `(0, 0)` at the north-west corner exactly, row 0 the north edge. */
export type SunField = {
  readonly bounds: LonLatBounds;
  readonly width: number;
  readonly height: number;
  readonly gx: Float32Array;
  readonly gy: Float32Array;
  readonly confidence: Float32Array;
  /** the planet radius the fit's km-based parameters were converted with. */
  readonly radiusM: number;
};
