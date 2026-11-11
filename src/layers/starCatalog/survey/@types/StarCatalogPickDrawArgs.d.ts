/**
 * One source's pick draw: the pick view's camera and the base dot size. The
 * leaves it draws are the frame cut's list, which stays on the GPU.
 */

import type { Vec2 } from '../../../../@types/math/Vec2';
import type { StarCatalogId } from '../../@types/StarCatalogId';
import type { StarFocusSphere } from '../../octreeCut/@types/StarFocusSphere';

export type StarCatalogPickDrawArgs = {
  readonly source: StarCatalogId;
  /** Rebased about the cut's origin, like the visual draw's. */
  readonly vp: Float32Array;
  readonly viewportPx: Vec2;
  readonly pxPerRad: number;
  readonly sizePx: number;
  readonly focus: StarFocusSphere;
};
