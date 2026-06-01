/**
 * famousPlacement — exercises the pure placement-math for famous-galaxy
 * thumbnails.
 *
 * The three helpers each answer one independent question:
 *   - calibratedDiskSizeWorld: how large must the quad be so the disk
 *     inside it spans the catalog size?
 *   - nucleusOffsetWorld: how far do we slide the quad so its nucleus
 *     lands on the catalog point?
 *   - effectiveTilt: what PA / axis ratio does the disk render with?
 *
 * The off-centre offset test pins the SIGN of the slide by hand: a
 * nucleus left of frame centre must produce a +right world offset so the
 * nucleus moves onto the catalog point.
 */

import { describe, it, expect } from 'vitest';

import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { FamousCalibration } from '../../../../src/@types/loading/FamousCalibration';
import {
  calibratedDiskSizeWorld,
  nucleusOffsetWorld,
  effectiveTilt,
} from '../../../../src/services/engine/subsystems/famousPlacement';

describe('calibratedDiskSizeWorld', () => {
  it('keeps a full-frame disk at catalog size', () => {
    // frac == 1 → disk fills the frame, so the quad size already equals
    // the catalog size.
    expect(calibratedDiskSizeWorld(40, 1)).toBe(40);
  });

  it('doubles a half-frame disk', () => {
    // frac == 0.5 → disk fills half the frame, so the quad must be twice
    // as large for the disk inside it to span the catalog size.
    expect(calibratedDiskSizeWorld(40, 0.5)).toBe(80);
  });

  it('falls back to catalog size on a non-positive frac', () => {
    // Malformed input (deriveFamousCalibration never emits this) must not
    // produce Infinity/NaN — the disk-fills-frame default is returned.
    expect(calibratedDiskSizeWorld(40, 0)).toBe(40);
    expect(calibratedDiskSizeWorld(40, -0.25)).toBe(40);
  });
});

describe('nucleusOffsetWorld', () => {
  const right: Readonly<Vec3> = [1, 0, 0];
  const up: Readonly<Vec3> = [0, 1, 0];

  it('is zero for a centred nucleus', () => {
    // center [0.5, 0.5] → delta zero → no slide.
    expect(nucleusOffsetWorld([0.5, 0.5], 100, right, up)).toEqual([0, 0, 0]);
  });

  it('moves an off-centre nucleus along the basis with the catalog-point sign', () => {
    // Nucleus at x=0.25 is LEFT of frame centre by 0.25.
    //   delta   = [0.25 - 0.5, 0.5 - 0.5] = [-0.25, 0]
    //   scaled  = delta * 100              = [-25, 0]
    //   world   = -(scaled.x * right + scaled.y * up) = -([-25,0,0]) = [25,0,0]
    // Positive +right: the quad slides right so the left-of-centre
    // nucleus reaches the catalog point.
    const offset = nucleusOffsetWorld([0.25, 0.5], 100, right, up);
    expect(offset).toEqual([25, 0, 0]);
  });
});

describe('effectiveTilt', () => {
  it('applies PA + axisRatio for a deprojected texture', () => {
    const calibration: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      paDeg: 37,
      axisRatio: 0.6,
      deprojected: true,
    };
    expect(effectiveTilt(calibration, 0.9)).toEqual({
      positionAngleDeg: 37,
      axisRatio: 0.6,
    });
  });

  it('renders an as-shot texture flat', () => {
    const calibration: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      paDeg: 37,
      axisRatio: 0.6,
      deprojected: false,
    };
    // As-shot images already carry the real inclination — re-squashing
    // would double the projection, so the disk renders flat.
    expect(effectiveTilt(calibration, 0.9)).toEqual({
      positionAngleDeg: 0,
      axisRatio: 1,
    });
  });

  it('falls back to the catalog axisRatio when calibration.axisRatio is absent', () => {
    const calibration: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      paDeg: 12,
      deprojected: true,
    };
    expect(effectiveTilt(calibration, 0.72)).toEqual({
      positionAngleDeg: 12,
      axisRatio: 0.72,
    });
  });
});
