import type { Vec3 } from '../math/Vec3';

/** The body's ground radius under one body-fixed direction, metres — datum plus
 *  resident terrain (spec §8.3). The argument's MAGNITUDE is ignored, so a caller
 *  hands over the eye vector it holds rather than normalizing one. */
export type GroundRadiusLookup = (dirBodyFixed: Readonly<Vec3>) => number;
