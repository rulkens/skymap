/**
 * ECLIPTIC_BASIS — the ecliptic plane expressed in the scene's equatorial frame.
 *
 * The scene frame (see `raDecDistToCartesian.ts` and `uvSphereMesh.ts`) is
 * right-handed equatorial J2000: +x is the vernal equinox direction, +z is
 * Earth's spin axis (the celestial north pole). The ecliptic — the plane of
 * Earth's orbit around the Sun, which every OTHER solar-system body (the
 * Moon, the planets) also orbits close to — is a DIFFERENT plane, tilted
 * away from the equatorial xy-plane by Earth's axial tilt, the obliquity
 * ε ≈ 23.44°.
 *
 * The two planes share one line: the equinox, where the Sun crosses the
 * equatorial plane heading north each spring. That shared line is exactly
 * frame +x, so +x needs no transform to land in the ecliptic. Rotating the
 * equatorial +y axis by ε about +x sweeps out the ecliptic's other in-plane
 * axis; rotating equatorial +z by the same ε sweeps out the ecliptic's
 * normal. Both rotations are about +x, so +x's own components are untouched
 * — only its y/z partners move.
 *
 * Seeding solar-system companions (the Moon, the planets) with an offset
 * along `yAxis` rather than frame +y is what makes the 23.4° tilt visible in
 * the scene at all: the frame's own +z IS Earth's spin axis, not the
 * ecliptic normal, so an offset along raw +y would place a companion 23.4°
 * out of the plane every real orbit stays near.
 */

import type { Vec3 } from '../../@types/math/Vec3';

type EclipticBasis = {
  readonly obliquityRad: number;
  readonly yAxis: Vec3; // ecliptic in-plane axis; equatorial-frame components
  readonly normal: Vec3; // ecliptic normal; equatorial-frame components
};

const OBLIQUITY_DEG = 23.44;
const obliquityRad = (OBLIQUITY_DEG * Math.PI) / 180;

export const ECLIPTIC_BASIS: EclipticBasis = {
  obliquityRad,
  yAxis: [0, Math.cos(obliquityRad), Math.sin(obliquityRad)],
  normal: [0, -Math.sin(obliquityRad), Math.cos(obliquityRad)],
};
