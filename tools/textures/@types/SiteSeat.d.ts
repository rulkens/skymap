import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';

/** SiteSeat — where a site's body is placed: the ground height, metres above
 *  the host's datum, and the ground's up in the site's (east, north, up) frame. */
export type SiteSeat = {
  readonly heightM: number;
  readonly up: Vec3;
};
