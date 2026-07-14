/**
 * satellite — row maker for a planet's guidance MOON: a satellite in its
 * parent's equatorial (Laplace) `plane`.
 *
 * The scene is static and per-moon epoch phases are not tabulated, so Ω/ω/M are
 * 0 — the moon's angular position is NOT modelled; what matters is the trail's
 * SIZE and TILT (its plane), which the semi-major axis, eccentricity,
 * inclination-to-equator, and `plane` carry. The body then sits at periapsis on
 * that ring (a valid point on its own trail). Takes a named-field spec (in the
 * units JPL publishes — km, degrees) so the many numeric columns can't be
 * mis-ordered at the call site.
 *
 * Lives beside `ORBITAL_ELEMENTS` in `makers/` rather than in `src/utils/`: it
 * is authoring policy, has a single consumer (the element table), and maker and
 * table change together.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { degToRad } from '../../../utils/math/degToRad';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';
import type { OrbitPlaneFrame } from '../../../@types/scene/OrbitPlaneFrame';
import type { Vec3 } from '../../../@types/math/Vec3';

export function satellite(spec: {
  id: string;
  parentId: string;
  plane: OrbitPlaneFrame;
  semiMajorKm: number;
  eccentricity: number;
  inclinationDeg: number;
  color: Vec3;
}): OrbitalElements {
  return {
    id: spec.id,
    parentId: spec.parentId,
    semiMajorMpc: spec.semiMajorKm * SCALE_UNITS.KM_TO_MPC,
    eccentricity: spec.eccentricity,
    inclinationRad: degToRad(spec.inclinationDeg),
    ascendingNodeRad: 0,
    argPeriapsisRad: 0,
    meanAnomalyRad: 0,
    color: spec.color,
    plane: spec.plane,
  };
}
