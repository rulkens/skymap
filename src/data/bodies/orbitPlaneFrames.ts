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
 * Each frame is derived once from a pole direction (RA, Dec): the pole is the
 * plane normal, the plane's ascending node on the celestial equator is the
 * in-plane reference (Ω origin), and the third axis completes the right-handed
 * basis. The parent-planet equatorial frames below use the planet's IAU J2000
 * north pole; the satellite maker (`makers/satellite`) instead calls the same
 * `planeFrameFromPole` with each moon's OWN Laplace-plane pole from the JPL
 * satellite-elements table, so a distant moon (Iapetus, whose Laplace plane
 * sits ~15° off Saturn's equator) rides its true plane rather than the shared
 * equatorial one — hence `planeFrameFromPole` is exported. The ecliptic is
 * simply the frame of the ecliptic pole, so `planeFrameFromPole` reproduces
 * `ECLIPTIC_FRAME` exactly (it equals `planeFrameFromPole(270, 66.56)` to
 * floating-point noise); `ECLIPTIC_FRAME` is written out directly from the
 * obliquity so the 23.44° has a single, legible source.
 *
 * The ecliptic — the plane of Earth's orbit, which every OTHER solar-system
 * body (the Moon, the planets) also orbits near — is tilted from the scene's
 * equatorial xy-plane by Earth's axial tilt, the obliquity ε ≈ 23.44°. The two
 * planes share one line: the equinox, where the Sun crosses the equatorial
 * plane heading north each spring. That shared line is exactly frame +x, so +x
 * needs no transform to land in the ecliptic; rotating equatorial +y by ε about
 * +x sweeps out the ecliptic's other in-plane axis and equatorial +z sweeps out
 * its normal. Seeding a companion with an offset along the ecliptic `yAxis`
 * rather than raw frame +y is what makes the 23.4° tilt visible at all — the
 * frame's own +z IS Earth's spin axis, not the ecliptic normal, so an offset
 * along raw +y would place a companion 23.4° out of the plane every real orbit
 * stays near.
 *
 * IAU north poles (WGCCRE, J2000): Mars α=317.681° δ=52.887°, Jupiter
 * α=268.057° δ=64.495°, Saturn α=40.589° δ=83.537°.
 */

import { degToRad } from '../../utils/math/degToRad';
import type { OrbitPlaneFrame } from '../../@types/scene/OrbitPlaneFrame';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Build a plane frame from an IAU north-pole direction. `normal` is the pole
 * (unit, in the equatorial frame); `xAxis` is the plane's ascending node on the
 * celestial equator — perpendicular to both the pole and celestial +z, i.e. the
 * direction at RA = α + 90° — and `yAxis = normal × xAxis` completes the
 * right-handed basis. An authored derivation that lives beside the frames it
 * builds, not in `src/utils/`; exported so the satellite maker builds each
 * moon's plane from its own transcribed Laplace-plane pole through this one
 * derivation rather than re-deriving the pole→basis math.
 */
export function planeFrameFromPole(poleRaDeg: number, poleDecDeg: number): OrbitPlaneFrame {
  const ra = degToRad(poleRaDeg);
  const dec = degToRad(poleDecDeg);
  const normal: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const xAxis: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const yAxis: Vec3 = [
    normal[1] * xAxis[2] - normal[2] * xAxis[1],
    normal[2] * xAxis[0] - normal[0] * xAxis[2],
    normal[0] * xAxis[1] - normal[1] * xAxis[0],
  ];
  return { xAxis, yAxis, normal };
}

// Earth's axial tilt: the angle between the equatorial and ecliptic planes.
const OBLIQUITY_DEG = 23.44;

/**
 * The ecliptic frame: the equinox +x is the shared node, and the y/z axes carry
 * the obliquity ε — `yAxis` is equatorial +y rotated by ε about +x, `normal` is
 * equatorial +z rotated the same. Written directly from `OBLIQUITY_DEG` so the
 * 23.44° has one source.
 */
const eps = degToRad(OBLIQUITY_DEG);
export const ECLIPTIC_FRAME: OrbitPlaneFrame = {
  xAxis: [1, 0, 0],
  yAxis: [0, Math.cos(eps), Math.sin(eps)],
  normal: [0, -Math.sin(eps), Math.cos(eps)],
};

export const MARS_EQUATORIAL_FRAME = planeFrameFromPole(317.681, 52.887);
export const JUPITER_EQUATORIAL_FRAME = planeFrameFromPole(268.057, 64.495);
export const SATURN_EQUATORIAL_FRAME = planeFrameFromPole(40.589, 83.537);
