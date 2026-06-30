/**
 * resolveDiskPlacement — exercises the per-row composition of the three
 * placement-math primitives plus the no-calibration default, so the
 * textured-disk loop body reads one frozen record per row.
 */

import { describe, it, expect } from 'vitest';

import type { FamousCalibration } from '../../../../src/@types/loading/FamousCalibration';
import { resolveDiskPlacement } from '../../../../src/utils/render/disk/resolveDiskPlacement';

describe('resolveDiskPlacement', () => {
  it('returns the catalog frame unchanged when there is no calibration', () => {
    // The common case — every non-famous row, and famous rows without a
    // curated WebP — passes the catalog size/axisRatio/PA straight through
    // with a centred nucleus, so the instance is bit-identical to the
    // uncalibrated path.
    expect(resolveDiskPlacement(40, 0.72, 137, undefined)).toEqual({
      sizeWorld: 40,
      axisRatio: 0.72,
      positionAngleDeg: 137,
      nucleusOffset: [0, 0],
    });
  });

  it('scales size and keeps catalog tilt for a deprojected calibration', () => {
    // diskRadiusFrac 0.5 → quad twice as large (×2); deprojected keeps the
    // catalog axisRatio/PA; a centred nucleus stays [0, 0].
    const calibration: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 0.5,
      deprojected: true,
    };
    expect(resolveDiskPlacement(40, 0.72, 137, calibration)).toEqual({
      sizeWorld: 80,
      axisRatio: 0.72,
      positionAngleDeg: 137,
      nucleusOffset: [0, 0],
    });
  });

  it('flattens an as-shot calibration to axisRatio 1 / PA 0', () => {
    // deprojected:false → the image already carries the inclination, so the
    // disk faces the sky plane and ignores the catalog tilt.
    const calibration: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 0.5,
      deprojected: false,
    };
    expect(resolveDiskPlacement(40, 0.72, 137, calibration)).toEqual({
      sizeWorld: 80,
      axisRatio: 1,
      positionAngleDeg: 0,
      nucleusOffset: [0, 0],
    });
  });
});
