import type { Vec3 } from '../math/Vec3';

/**
 * The body's ground radius under one body-fixed direction, metres — datum plus
 * terrain once F3a lands (spec §8.3, ground-collision row). The argument names a
 * direction only: its magnitude is ignored, so a caller hands over the eye
 * vector it already holds rather than normalizing one.
 */
export type GroundRadiusLookup = (dirBodyFixed: Readonly<Vec3>) => number;
