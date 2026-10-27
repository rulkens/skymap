import { describe, it, expect } from 'vitest';
import { buildGeodesicTrack } from '../../../../src/services/engine/animation/buildGeodesicTrack';
import { geodesicPath } from '../../../../src/utils/camera/geodesicPath';
import { DEFAULT_GEODESIC_TUNING } from '../../../../src/data/camera/focusMoveDefaults';
import { relErr } from '../../../support/relErr';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const FOV_Y = (50 * Math.PI) / 180;
const TUNING = DEFAULT_GEODESIC_TUNING;
const START: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: -0.2, distance: 100 };

describe('buildGeodesicTrack', () => {
  it.each([
    ['galaxy hop', START, { target: [30, 40, 0] as Vec3, distance: 2 }],
    // M31 → Earth: the target error must stay small against the 9e-16 Mpc
    // arrival distance, not against the 0.78 Mpc separation.
    [
      'M31 → Earth',
      { target: [0.78, 0, 0] as Vec3, yaw: 0, pitch: 0, distance: 0.05 },
      { target: [0, 0, 0] as Vec3, distance: 8.94e-16 },
    ],
  ])('lands exactly on to: %s', (_name, start, to) => {
    const track = buildGeodesicTrack({ start, startSec: 3, to, tuning: TUNING, fovYRad: FOV_Y });
    const last = track.sample(track.endSec - track.startSec);
    expect(relErr(last.distance!, to.distance)).toBeLessThanOrEqual(1e-9);
    const miss = Math.hypot(
      last.target![0] - to.target[0],
      last.target![1] - to.target[1],
      last.target![2] - to.target[2],
    );
    expect(miss / to.distance).toBeLessThan(1e-6);
  });

  it("omitted over uses geodesicPath's duration", () => {
    const to = { target: [30, 40, 0] as Vec3, distance: 2 };
    const { durationMs } = geodesicPath(START, to, FOV_Y, TUNING);
    // A clamped duration would let a fixed-constant implementation pass.
    expect(durationMs).toBeGreaterThan(TUNING.minMs);
    expect(durationMs).toBeLessThan(TUNING.maxMs);

    const track = buildGeodesicTrack({
      start: START,
      startSec: 7,
      to,
      tuning: TUNING,
      fovYRad: FOV_Y,
    });
    expect(track.endSec).toBe(7 + durationMs / 1000);
  });
});
