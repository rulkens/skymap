/**
 * antiquePlateBody — the pole (a ring's normal) is the orientation's pole COLUMN (a row
 * tilts Saturn's ring the wrong way), the Sun points from the body toward the
 * Sun, a surface spot is rotated from body-fixed east longitude and latitude into world
 * axes (a sign slip moves Jupiter's Red Spot off the plain render's), the apparent radius is the silhouette cone's (not the bare 1/d), ring
 * radii are in the drawn radius, and an eye inside the relief shell (plus the
 * margin) gets no record: a sphere cast there drew a false horizon on Mars.
 */

import { describe, it, expect } from 'vitest';

import { antiquePlateBody } from '../../../../src/utils/gpu/antiqueLook/antiquePlateBody';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const RADIUS_M = 58_232_000;
const R_MPC = RADIUS_M / SCALE_UNITS.MPC_TO_M;
// Rotation about world x by 30°, column-major: local z → (0, −sin, cos).
const S = Math.sin(Math.PI / 6);
const C = Math.cos(Math.PI / 6);
const TILT: Mat3 = [1, 0, 0, 0, C, S, 0, -S, C];

// Corner rays of a narrow frame looking down −y, and one looking along x past the limb.
const DOWN: Vec3[] = [
  [0.05, -1, 0.05],
  [-0.05, -1, 0.05],
  [0.05, -1, -0.05],
  [-0.05, -1, -0.05],
].map(([x, y, z]) => [
  x! / Math.hypot(x!, y!, z!),
  y! / Math.hypot(x!, y!, z!),
  z! / Math.hypot(x!, y!, z!),
]);
const LEVEL: Vec3[] = [
  [1, 0.05, 0.05],
  [1, -0.05, 0.05],
  [1, 0.05, -0.05],
  [1, -0.05, -0.05],
];

const at = (
  eye: Vec3,
  cornerRays: readonly Vec3[] = LEVEL,
  spotLonLatDeg: readonly [number, number] | null = null,
) =>
  antiquePlateBody({
    positionMpc: [0, 0, 0],
    orientation: TILT,
    radiusM: RADIUS_M,
    outerRadiusM: RADIUS_M + 20_000,
    print: 'plain',
    ringKm: [74_500, 92_000, 119_875, 136_775, 140_220],
    eyeMpc: eye,
    sunMpc: [-1e-5, 0, 0],
    unitsPerRad: 800,
    cornerRays,
    spotLonLatDeg,
  });

describe('antiquePlateBody', () => {
  it('casts from the eye in body radii, with the Sun and pole in world axes', () => {
    const body = at([0, 0, -2 * R_MPC])!;
    expect(body.centre[2]).toBeCloseTo(2, 9);
    expect(body.radiusUnits).toBeCloseTo(800 / Math.sqrt(3), 6);
    expect(body.sun).toEqual([-1, 0, 0]);
    expect(body.pole).toEqual([0, -S, C]);
    expect(body.ring!.lines[0]).toBeCloseTo(74_500 / 58_232, 9);
    expect(body.ring!.outer).toBeCloseTo(140_220 / 58_232, 9);
  });

  it('turns a spot at 90° east on the equator to the orientation’s y column', () => {
    const eye: Vec3 = [0, 0, -2 * R_MPC];
    expect(at(eye)!.spot).toBeNull();
    const spot = at(eye, LEVEL, [90, 0])!.spot!;
    [0, C, S].forEach((v, i) => expect(spot[i]).toBeCloseTo(v, 9));
    const south = at(eye, LEVEL, [0, -30])!.spot!;
    [C, 0.5 * S, -0.5 * C].forEach((v, i) => expect(south[i]).toBeCloseTo(v, 9));
  });

  it('records nothing for an eye inside or just above the relief', () => {
    expect(at([0, 0.5 * R_MPC, 0])).toBeNull();
    // 4 km over the highest peak: above the sphere, still under the margin.
    expect(at([0, (RADIUS_M + 24_000) / SCALE_UNITS.MPC_TO_M, 0])).toBeNull();
    expect(at([0, 1.1 * R_MPC, 0])).not.toBeNull();
  });

  it('records a globe under the margin when the whole frame looks onto it', () => {
    const low: Vec3 = [0, (RADIUS_M + 24_000) / SCALE_UNITS.MPC_TO_M, 0];
    expect(at(low, DOWN)).not.toBeNull();
    expect(at(low, LEVEL)).toBeNull();
    // Still nothing from inside the relief shell, whatever the frame.
    expect(at([0, (RADIUS_M + 10_000) / SCALE_UNITS.MPC_TO_M, 0], DOWN)).toBeNull();
  });
});
