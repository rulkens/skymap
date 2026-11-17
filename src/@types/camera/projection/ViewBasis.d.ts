/**
 * ViewBasis — a camera's world-axis forward, screen-right and screen-up unit
 * vectors, the basis `computeViewProj` builds its view matrix from.
 */

import type { Vec3 } from '../../math/Vec3';

export type ViewBasis = {
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
};
