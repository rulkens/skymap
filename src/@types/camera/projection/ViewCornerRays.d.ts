/**
 * ViewCornerRays — un-normalised world-frame view rays through the four corners
 * of the image (top-left first, screen y down). Bilinear between them is exact
 * for a pinhole camera, so a full-screen pass recovers any pixel's ray from them.
 */

import type { Vec3 } from '../../math/Vec3';

export type ViewCornerRays = {
  readonly tl: Vec3;
  readonly tr: Vec3;
  readonly bl: Vec3;
  readonly br: Vec3;
};
