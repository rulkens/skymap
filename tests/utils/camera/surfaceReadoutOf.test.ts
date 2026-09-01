/**
 * surfaceReadoutOf tests — the KML LookAt-style readout at the ENU of the
 * point under the screen centre (spec §3, §14).
 *
 * All poses use a 1000 km-radius sphere (`R = 1_000_000`) and an eye at
 * `1.1 R` (`altitudeM = 100_000`) so the same round numbers recur.
 * `basisLocal` columns are right=[0,1,2], up=[3,4,5], forward=[6,7,8]
 * (`BodyFixedPose`'s doc). Every fixture's forward/up pair is hand-verified
 * perpendicular; expected values are derived independently from the ray
 * geometry (checked against a standalone script), not by mirroring the
 * implementation under test.
 */

import { describe, it, expect } from 'vitest';
import { surfaceReadoutOf } from '../../../src/utils/camera/surfaceReadoutOf';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const R = 1_000_000;
const ALTITUDE = 100_000;

function poseAt(eye: readonly [number, number, number], basisLocal: Mat3): BodyFixedPose {
  return {
    bodyId: 'earth',
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [eye[0], eye[1], eye[2]],
    basisLocal,
  };
}

describe('surfaceReadoutOf', () => {
  it('altitudeM is |eye| − R, not derived from the range (FW-A)', () => {
    // Eye on the equator/prime-meridian axis; forward tilted 60° off nadir
    // (in the plane of Up=+X and North=+Z) so the sightline grazes the
    // sphere far from the sub-camera point — a hand-verified ray-sphere
    // solve puts the near hit at ~245,862 m, well over double the 100,000 m
    // altitude.
    const basis: Mat3 = [
      -Math.sqrt(0.75),
      0,
      0.5, // right
      0,
      1,
      0, // up
      -0.5,
      0,
      -Math.sqrt(0.75), // forward
    ];
    const pose = poseAt([1_100_000, 0, 0], basis);

    const readout = surfaceReadoutOf(pose, R);

    expect(readout.altitudeM).toBeCloseTo(ALTITUDE, 6);
    expect(readout.rangeM).toBeGreaterThan(readout.altitudeM * 2);
  });

  it('standpoint is the sub-camera lon/lat at nadir', () => {
    // Looking straight down from lon=90°, lat=0° (eye on +Y): the forward
    // ray's near hit is exactly the point below the eye.
    const basis: Mat3 = [
      0,
      0,
      -1, // right
      1,
      0,
      0, // up
      0,
      -1,
      0, // forward (nadir, since eye is along +Y)
    ];
    const pose = poseAt([0, 1_100_000, 0], basis);

    const readout = surfaceReadoutOf(pose, R);

    expect(readout.standpoint.lonDeg).toBeCloseTo(90, 6);
    expect(readout.standpoint.latDeg).toBeCloseTo(0, 6);
    expect(readout.rangeM).toBeCloseTo(ALTITUDE, 6);
  });

  it('heading falls back to the up vector within ~0.08° of vertical', () => {
    // Forward sits 0.05° off nadir (under the 0.08° escape threshold),
    // tilted toward East — a naive implementation that always reads
    // forward's horizontal projection would report heading ≈ East (90°).
    // `up` is pinned exactly North, so the correct fallback reports 0°.
    const theta = (0.05 * Math.PI) / 180;
    const basis: Mat3 = [
      -Math.sin(theta),
      -Math.cos(theta),
      0, // right
      0,
      0,
      1, // up (North)
      -Math.cos(theta),
      Math.sin(theta),
      0, // forward (0.05° off nadir, toward East)
    ];
    const pose = poseAt([1_100_000, 0, 0], basis);

    const readout = surfaceReadoutOf(pose, R);

    expect(Math.abs(readout.headingRad)).toBeLessThan(0.01);
  });

  it('readout is finite and continuous stepping across the pole', () => {
    // Two nadir-looking poses at lat ≈ 89.999°, on opposite sides of the
    // pole (lon 0° vs lon 180°) — the coordinate singularity itself, not a
    // gentle approach to it. Every field must stay a finite number; no
    // NaN/Infinity from the East-vector construction's near-zero divide.
    const lat = (89.999 * Math.PI) / 180;
    const eyeAt = (lonDeg: number): readonly [number, number, number] => {
      const lon = (lonDeg * Math.PI) / 180;
      const m = 1_100_000;
      return [
        Math.cos(lat) * Math.cos(lon) * m,
        Math.cos(lat) * Math.sin(lon) * m,
        Math.sin(lat) * m,
      ];
    };
    const nadirBasisAt = (eye: readonly [number, number, number]): Mat3 => {
      const m = Math.hypot(eye[0], eye[1], eye[2]);
      const forward: [number, number, number] = [-eye[0] / m, -eye[1] / m, -eye[2] / m];
      const up: [number, number, number] = [1, 0, 0];
      const right: [number, number, number] = [
        up[1] * forward[2] - up[2] * forward[1],
        up[2] * forward[0] - up[0] * forward[2],
        up[0] * forward[1] - up[1] * forward[0],
      ];
      return [
        right[0],
        right[1],
        right[2],
        up[0],
        up[1],
        up[2],
        forward[0],
        forward[1],
        forward[2],
      ];
    };

    for (const lonDeg of [0, 180]) {
      const eye = eyeAt(lonDeg);
      const readout = surfaceReadoutOf(poseAt(eye, nadirBasisAt(eye)), R);
      expect(Number.isFinite(readout.standpoint.lonDeg)).toBe(true);
      expect(Number.isFinite(readout.standpoint.latDeg)).toBe(true);
      expect(Number.isFinite(readout.headingRad)).toBe(true);
      expect(Number.isFinite(readout.tiltRad)).toBe(true);
      expect(Number.isFinite(readout.rangeM)).toBe(true);
      expect(Number.isFinite(readout.altitudeM)).toBe(true);
    }

    // The pole itself (eye on the polar axis): the East-vector construction
    // divides by ~zero here unless the fallback fires.
    const poleBasis: Mat3 = [0, 1, 0, 1, 0, 0, 0, 0, -1]; // right, up=+X, forward=-Z (nadir)
    const poleReadout = surfaceReadoutOf(poseAt([0, 0, 1_100_000], poleBasis), R);
    expect(Number.isFinite(poleReadout.standpoint.lonDeg)).toBe(true);
    expect(Number.isFinite(poleReadout.headingRad)).toBe(true);
  });

  it('tiltRad is 0 looking straight down', () => {
    const basis: Mat3 = [
      0,
      0,
      0.5, // right (unused, not unit — irrelevant to this function)
      0,
      1,
      0, // up
      -1,
      0,
      0, // forward (nadir)
    ];
    const pose = poseAt([1_100_000, 0, 0], basis);

    expect(surfaceReadoutOf(pose, R).tiltRad).toBeCloseTo(0, 9);
  });

  it('tiltRad is π looking at the zenith', () => {
    // Forward points straight away from the body — the ray never hits the
    // sphere (both raySphereRoots roots negative), so this also exercises
    // the eye-footprint fallback.
    const basis: Mat3 = [
      0,
      0,
      -1, // right
      0,
      1,
      0, // up
      1,
      0,
      0, // forward (zenith)
    ];
    const pose = poseAt([1_100_000, 0, 0], basis);

    const readout = surfaceReadoutOf(pose, R);
    expect(readout.tiltRad).toBeCloseTo(Math.PI, 9);
    expect(readout.rangeM).toBeCloseTo(ALTITUDE, 6);
  });
});
