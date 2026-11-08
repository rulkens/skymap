import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * One body as the eye sees it this frame, asked by surface point (latitude and
 * EAST-positive longitude, degrees): what the antique look's place names need to fit
 * a name to what it names, keep it on the lit disc and choose its side. In CSS px, the
 * unit names are sized in, so a layout reads alike at any device pixel ratio. Built by
 * `antiqueBodyView`; a test fakes it with any projection.
 */
export type AntiqueBodyView = {
  /** CSS px (y down) of a surface point, null behind the camera. */
  readonly project: (latDeg: number, lonDeg: number) => Vec2 | null;
  /** Cosine between the ground's normal and its direction to the eye: ≤ 0 past the limb. */
  readonly facing: (latDeg: number, lonDeg: number) => number;
  /** Cosine between the ground's normal and the Sun: ≤ 0 on the night side. */
  readonly sunCos: (latDeg: number, lonDeg: number) => number;
  /** Px per km of ground seen square-on at the point's distance. */
  readonly pxPerKm: (latDeg: number, lonDeg: number) => number;
  /** The disc's centre in CSS px, null when it is behind the camera. */
  readonly discCentrePx: Vec2 | null;
  readonly discRadiusPx: number;
  readonly radiusKm: number;
  /**
   * The camera-relative world point (Mpc) a NEAR0 label anchors at to land on a CSS
   * px: on that px's ray, as deep as the surface point, so a name set off its crater's
   * rim draws at the crater's depth and size.
   */
  readonly anchorMpc: (xPx: number, yPx: number, latDeg: number, lonDeg: number) => Vec3;
};
