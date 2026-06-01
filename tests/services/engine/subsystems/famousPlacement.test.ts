/**
 * famousPlacement — exercises the pure placement-math for famous-galaxy
 * thumbnails.
 *
 * The three helpers each answer one independent question:
 *   - calibratedDiskSizeWorld: how large must the quad be so the disk
 *     inside it spans the catalog size?
 *   - nucleusCorner: where does the nucleus sit in the disk's local
 *     corner frame so the shader can slide it onto the catalog point?
 *   - effectiveTilt: what PA / axis ratio does the disk render with?
 *
 * The webp-corner mapping tests pin the no-flip convention by hand: a
 * top-left nucleus must map to corner [-1, -1] (NOT [-1, +1]), matching
 * the atlas's top-down upload.
 */

import { describe, it, expect } from 'vitest';

import type { FamousCalibration } from '../../../../src/@types/loading/FamousCalibration';
import {
  calibratedDiskSizeWorld,
  nucleusCorner,
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

describe('nucleusCorner', () => {
  it('is [0,0] for a centred nucleus', () => {
    // center [0.5, 0.5] → [0, 0] — the uncalibrated default that leaves
    // the quad unshifted.
    expect(nucleusCorner([0.5, 0.5])).toEqual([0, 0]);
  });

  it('maps an off-centre nucleus to corner space', () => {
    // center.x = 0.25 → 0.25 * 2 - 1 = -0.5; center.y = 0.5 → 0.
    expect(nucleusCorner([0.25, 0.5])).toEqual([-0.5, 0]);
  });

  it('maps webp top-left to corner [-1,-1]', () => {
    // Pins the no-flip convention: webp-top (v = 0) maps to corner.y = -1,
    // matching the atlas's top-down upload. A v-flip would give [-1, +1].
    expect(nucleusCorner([0, 0])).toEqual([-1, -1]);
  });

  it('maps webp bottom-right to corner [1,1]', () => {
    expect(nucleusCorner([1, 1])).toEqual([1, 1]);
  });
});

describe('effectiveTilt', () => {
  it('applies PA + axisRatio for a deprojected texture', () => {
    const calibration: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      frameMajorAxisDeg: 37,
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
      frameMajorAxisDeg: 37,
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
      frameMajorAxisDeg: 12,
      deprojected: true,
    };
    expect(effectiveTilt(calibration, 0.72)).toEqual({
      positionAngleDeg: 12,
      axisRatio: 0.72,
    });
  });
});
