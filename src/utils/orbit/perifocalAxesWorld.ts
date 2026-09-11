/**
 * perifocalAxesWorld — the orbit plane's two unit direction vectors, in the
 * scene's equatorial-world frame: `P̂` toward periapsis, `Q̂` 90° prograde.
 *
 * These are the first two columns of `R = Rz(Ω)·Rx(i)·Rz(ω)`, then mapped out
 * of the row's reference plane (`elements.plane`, default `ECLIPTIC_FRAME`).
 * Scalar arithmetic on the six entries we need beats assembling two 3×3
 * matrices: a once-per-orbit derivation, and the closed forms are standard.
 * Orientation only, so ellipses and hyperbolas share it unchanged.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { OrbitPlaneFrame } from '../../@types/scene/OrbitPlaneFrame';
import type { Vec3 } from '../../@types/math/Vec3';
import { ECLIPTIC_FRAME } from '../../data/bodies/orbitPlaneFrames';

/**
 * `vx·xAxis + vy·yAxis + vz·normal`. For the ecliptic frame `xAxis` is the
 * shared equinox `[1,0,0]`; a planet's equatorial frame tilts all three axes,
 * so the general three-axis combination is used.
 */
function frameToWorld(frame: OrbitPlaneFrame, vx: number, vy: number, vz: number): Vec3 {
  const { xAxis, yAxis, normal } = frame;
  return [
    vx * xAxis[0] + vy * yAxis[0] + vz * normal[0],
    vx * xAxis[1] + vy * yAxis[1] + vz * normal[1],
    vx * xAxis[2] + vy * yAxis[2] + vz * normal[2],
  ];
}

export function perifocalAxesWorld(elements: OrbitalElements): {
  readonly pWorld: Vec3;
  readonly qWorld: Vec3;
} {
  const cosI = Math.cos(elements.inclinationRad);
  const sinI = Math.sin(elements.inclinationRad);
  const cosO = Math.cos(elements.ascendingNodeRad);
  const sinO = Math.sin(elements.ascendingNodeRad);
  const cosW = Math.cos(elements.argPeriapsisRad);
  const sinW = Math.sin(elements.argPeriapsisRad);

  const px = cosO * cosW - sinO * cosI * sinW;
  const py = sinO * cosW + cosO * cosI * sinW;
  const pz = sinI * sinW;
  const qx = -cosO * sinW - sinO * cosI * cosW;
  const qy = -sinO * sinW + cosO * cosI * cosW;
  const qz = sinI * cosW;

  const frame = elements.plane ?? ECLIPTIC_FRAME;
  return {
    pWorld: frameToWorld(frame, px, py, pz),
    qWorld: frameToWorld(frame, qx, qy, qz),
  };
}
