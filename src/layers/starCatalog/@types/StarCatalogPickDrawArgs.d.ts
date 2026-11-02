/**
 * One source's pick draw: the pick view's camera and the base dot size. The
 * leaves it draws are the frame cut's list, which stays on the GPU.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { StarFocusSphere } from './StarFocusSphere';

export type StarCatalogPickDrawArgs = {
  readonly source: StarCatalogSourceType;
  /** Rebased about the cut's origin, like the visual draw's. */
  readonly vp: Float32Array;
  readonly viewportPx: Vec2;
  readonly pxPerRad: number;
  readonly sizePx: number;
  readonly focus: StarFocusSphere;
};
