/**
 * AntiquePlateBody — one globe the plate ray-casts (`antiqueLook/plateBodies.wesl`),
 * in world (equatorial) axes, lengths in the body's radii.
 */

import type { Vec3 } from '../math/Vec3';
import type { AntiquePlateRing } from './AntiquePlateRing';

export type AntiquePlateBody = {
  /** Eye → centre, in body radii. */
  readonly centre: Readonly<Vec3>;
  /** Apparent radius, print units: the hatch's bow and the ring hatch scale with it. */
  readonly radiusUnits: number;
  /** Centre → Sun, unit. */
  readonly sun: Readonly<Vec3>;
  /** Whether `wash.a` can hold this body's land share (a land map drew: Earth's
   * oceans, Mars's dark albedo). */
  readonly land: boolean;
  readonly ring: AntiquePlateRing | null;
};
