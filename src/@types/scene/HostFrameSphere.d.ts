/**
 * HostFrameSphere — a body resolved into its HOST's fixed-axis frame, in
 * metres: the shape `bodySlabRow` reads for an attached mesh body's near face.
 */

import type { Vec3 } from '../math/Vec3';

export type HostFrameSphere = {
  readonly posM: Readonly<Vec3>;
  readonly radiusM: number;
};
