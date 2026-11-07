/**
 * AntiquePlateBody — one globe the plate ray-casts (`antiqueLook/plateBodies.wesl`),
 * in world (equatorial) axes, lengths in the body's radii.
 */

import type { Vec3 } from '../math/Vec3';
import type { AntiquePlateRing } from './AntiquePlateRing';
import type { AntiqueBodyPrint } from './AntiqueBodyPrint';

export type AntiquePlateBody = {
  /** Eye → centre, in body radii. */
  readonly centre: Readonly<Vec3>;
  /** Apparent radius, print units: the hatch's bow and the ring hatch scale with it. */
  readonly radiusUnits: number;
  /** Centre → Sun, unit. */
  readonly sun: Readonly<Vec3>;
  /** Its print convention; one that reads the land row is `plain` when that did not draw. */
  readonly print: AntiqueBodyPrint;
  /** North pole, unit: a ring's plane normal, and the latitude a print hatches along. */
  readonly pole: Readonly<Vec3>;
  readonly ring: AntiquePlateRing | null;
};
