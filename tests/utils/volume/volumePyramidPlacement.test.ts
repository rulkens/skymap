import { describe, it, expect } from 'vitest';
import type { VolumePyramidSidecar } from '../../../src/@types/data/volume/VolumePyramidSidecar';
import { volumePyramidPlacement } from '../../../src/utils/volume/volumePyramidPlacement';

const MCPM: VolumePyramidSidecar = {
  gridDims: [712, 1200, 728],
  voxelMpc: 0.78131,
  originMpc: [-517.61536, -485.3478, -83.12184],
  frame: 'equatorial-cartesian',
  dataBox: { originVox: [40, 40, 40], dims: [672, 1152, 648] },
  levelMax: [134143.296875, 81543.546875, 40429.76953125, 12616.5263671875],
};

const MRS: VolumePyramidSidecar = {
  ...MCPM,
  levelMax: [11272, 6090, 2702.28, 1187.88],
};

describe('volumePyramidPlacement', () => {
  it("gain restores today's per-tier stretch", () => {
    expect(volumePyramidPlacement(MCPM, 1).gain).toBeCloseTo(1.044, 4);
    expect(volumePyramidPlacement(MCPM, 2).gain).toBeCloseTo(1.1131, 4);
    expect(volumePyramidPlacement(MRS, 1).gain).toBeCloseTo(1.0706, 4);
    expect(volumePyramidPlacement(MRS, 2).gain).toBeCloseTo(1.1807, 4);
  });

  it('placement moves to the box and doubles the voxel per level', () => {
    const base1 = volumePyramidPlacement(MCPM, 1).placement;
    expect(base1.origin[0]).toBeCloseTo(-486.36296, 4);
    expect(base1.origin[1]).toBeCloseTo(-454.0954, 4);
    expect(base1.origin[2]).toBeCloseTo(-51.86944, 4);
    expect(base1.voxelSize).toBeCloseTo(1.56262, 5);
    expect(base1.dims).toEqual([336, 576, 324]);

    const base2 = volumePyramidPlacement(MCPM, 2).placement;
    expect(base2.voxelSize).toBeCloseTo(3.12524, 5);
    expect(base2.dims).toEqual([168, 288, 162]);
  });

  it('the native box is the stored box over the grid', () => {
    const { offset, scale } = volumePyramidPlacement(MCPM, 1).nativeBox;
    expect(offset[0]).toBeCloseTo(40 / 712, 6);
    expect(offset[1]).toBeCloseTo(40 / 1200, 6);
    expect(offset[2]).toBeCloseTo(40 / 728, 6);
    expect(scale[0]).toBeCloseTo(672 / 712, 6);
    expect(scale[1]).toBeCloseTo(1152 / 1200, 6);
    expect(scale[2]).toBeCloseTo(648 / 728, 6);
  });
});
