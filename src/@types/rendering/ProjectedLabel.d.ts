/**
 * ProjectedLabel — `projectLabel`'s output, written in place: the anchor in
 * output px (+y down), the local pixels per radian there, and the image-up
 * direction the glyph quad is built along. `px`, `pxPerRad` are 0 when a pinhole hides it;
 * a fisheye still places a direction under its horizon, outside the circle.
 */

import type { Vec2 } from '../../../packages/shared/src/@types/math/Vec2';

export type ProjectedLabel = {
  px: Vec2;
  pxPerRad: number;
  up: Vec2;
  visible: boolean;
};
