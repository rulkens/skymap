/**
 * One source's pick draw: the pick view's camera and the base dot size. The
 * leaves it draws are the frame cut's list, which stays on the GPU.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { SourceType } from '../../../@types/data/SourceType';

export type StarCatalogPickDrawArgs = {
  readonly source: SourceType;
  /** Rebased about the cut's origin, like the visual draw's. */
  readonly vp: Float32Array;
  readonly viewportPx: Vec2;
  readonly pxPerRad: number;
  readonly sizePx: number;
};
