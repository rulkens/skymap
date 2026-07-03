/**
 * calibratedDiskSizeWorld — exercises the pure placement-math for a
 * famous-galaxy thumbnail's world-space size: how large must the quad be
 * so the disk inside it spans the catalog size?
 */

import { describe, it, expect } from 'vitest';

import { calibratedDiskSizeWorld } from '../../../../src/utils/render/disk/calibratedDiskSizeWorld';

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
