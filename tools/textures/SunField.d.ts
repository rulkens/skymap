import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/** A fitted (or manual) sun-direction field: `g`, a per-cell 2-vector, over a
 *  plain equirect raster — `width × height` cells spanning `bounds`, row 0
 *  the north edge, same convention as `SurfaceImagerySource.readBox`. */
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
