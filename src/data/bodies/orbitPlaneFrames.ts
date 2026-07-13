/**
 * orbitPlaneFrames — the reference planes a body's orbital elements (i, Ω, ω)
 * are measured in, as orthonormal right-handed bases in the scene's
 * equatorial-world frame.
 *
 * Planets and Earth's Moon are referenced to the ECLIPTIC — JPL publishes their
 * elements there. But a planet's OWN moons are referenced to that planet's
 * EQUATORIAL (Laplace) plane: Saturn's is tilted ~27° to the ecliptic, which is
 * exactly why its rings and regular moons ride tilted, and Mars's ~25°. Feeding
 * satellite elements through the ecliptic frame would lay those orbits flat —
 * visibly wrong. So the plane is a per-orbit property (see `OrbitalElements.plane`).
 *
 * Each frame is derived once from the parent body's IAU J2000 north-pole
 * direction (RA, Dec): the pole is the plane normal, the plane's ascending node
 * on the celestial equator is the in-plane reference (Ω origin), and the third
 * axis completes the right-handed basis. The ecliptic is simply the frame of
 * the ecliptic pole, so `planeFrameFromPole` reproduces `ECLIPTIC_BASIS`
 * exactly — `ECLIPTIC_FRAME` reuses that constant rather than re-deriving the
 * 23.44° obliquity, keeping one source for it.
 *
 * IAU north poles (WGCCRE, J2000): Mars α=317.681° δ=52.887°, Jupiter
 * α=268.057° δ=64.495°, Saturn α=40.589° δ=83.537°.
 */

import { ECLIPTIC_BASIS } from './eclipticBasis';
import type { OrbitPlaneFrame } from '../../@types/scene/OrbitPlaneFrame';
import type { Vec3 } from '../../@types/math/Vec3';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Build a plane frame from an IAU north-pole direction. `normal` is the pole
 * (unit, in the equatorial frame); `xAxis` is the plane's ascending node on the
 * celestial equator — perpendicular to both the pole and celestial +z, i.e. the
 * direction at RA = α + 90° — and `yAxis = normal × xAxis` completes the
 * right-handed basis. Module-local: a fixed authored derivation does not earn a
 * `src/utils/` export (same status as `orbitalElements.ts`'s `DEG_TO_RAD`).
 */
function planeFrameFromPole(poleRaDeg: number, poleDecDeg: number): OrbitPlaneFrame {
  const ra = poleRaDeg * DEG_TO_RAD;
  const dec = poleDecDeg * DEG_TO_RAD;
  const normal: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const xAxis: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const yAxis: Vec3 = [
    normal[1] * xAxis[2] - normal[2] * xAxis[1],
    normal[2] * xAxis[0] - normal[0] * xAxis[2],
    normal[0] * xAxis[1] - normal[1] * xAxis[0],
  ];
  return { xAxis, yAxis, normal };
}

/**
 * The ecliptic frame: the equinox +x is the shared node, the y/z axes carry the
 * obliquity. Reuses `ECLIPTIC_BASIS` so the 23.44° obliquity has one source
 * (it equals `planeFrameFromPole(270, 66.56)` to floating-point noise).
 */
export const ECLIPTIC_FRAME: OrbitPlaneFrame = {
  xAxis: [1, 0, 0],
  yAxis: ECLIPTIC_BASIS.yAxis,
  normal: ECLIPTIC_BASIS.normal,
};

export const MARS_EQUATORIAL_FRAME = planeFrameFromPole(317.681, 52.887);
export const JUPITER_EQUATORIAL_FRAME = planeFrameFromPole(268.057, 64.495);
export const SATURN_EQUATORIAL_FRAME = planeFrameFromPole(40.589, 83.537);
