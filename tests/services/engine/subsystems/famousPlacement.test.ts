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
  it('places a deprojected texture in the catalog 3D plane', () => {
    // A deprojected (face-on) texture re-projects correctly when mapped onto
    // the galaxy's real world-fixed plane, so the disk must render with the
    // catalog's on-sky PA + inclination — identical to the procedural and
    // uncalibrated paths. The calibration contributes no orientation.
    const calibration: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      deprojected: true,
    };
    expect(effectiveTilt(calibration, 0.72, 137)).toEqual({
      positionAngleDeg: 137,
      axisRatio: 0.72,
    });
  });

  it('renders an as-shot texture flat regardless of catalog tilt', () => {
    // As-shot images already carry Earth's projection — re-tilting would
    // double the foreshortening, so the disk faces the sky plane (PA 0,
    // axisRatio 1) and ignores the catalog tilt.
    const calibration: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      deprojected: false,
    };
    expect(effectiveTilt(calibration, 0.72, 137)).toEqual({
      positionAngleDeg: 0,
      axisRatio: 1,
    });
  });
});
