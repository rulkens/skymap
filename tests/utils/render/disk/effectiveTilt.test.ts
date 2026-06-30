/**
 * effectiveTilt — exercises the pure placement-math for the tilt (PA /
 * axis ratio) a famous-galaxy thumbnail renders with.
 */

import { describe, it, expect } from 'vitest';

import type { FamousCalibration } from '../../../../src/@types/loading/FamousCalibration';
import { effectiveTilt } from '../../../../src/utils/render/disk/effectiveTilt';

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
