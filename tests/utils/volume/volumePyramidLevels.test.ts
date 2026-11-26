import { describe, it, expect } from 'vitest';
import type { VolumePyramidSidecar } from '../../../src/@types/data/volume/VolumePyramidSidecar';
import { volumePyramidLevels } from '../../../src/utils/volume/volumePyramidLevels';

const MCPM: VolumePyramidSidecar = {
  gridDims: [712, 1200, 728],
  voxelMpc: 0.78131,
  originMpc: [-517.61536, -485.3478, -83.12184],
  frame: 'equatorial-cartesian',
  dataBox: { originVox: [40, 40, 40], dims: [672, 1152, 648] },
  levelMax: [134143.296875, 81543.546875, 40429.76953125, 12616.5263671875],
};

const bytes = (format: GPUTextureFormat) =>
  volumePyramidLevels(MCPM, 1, format).map((l) => l.byteLength);

describe('volumePyramidLevels', () => {
  it('MCPM at base 1: three levels, mips 0–2, dims and bytes per format as built', () => {
    const levels = volumePyramidLevels(MCPM, 1, 'astc-6x6-unorm');
    expect(levels.map((l) => [l.level, l.mip, ...l.dims])).toEqual([
      [1, 0, 336, 576, 324],
      [2, 1, 168, 288, 162],
      [3, 2, 84, 144, 81],
    ]);
    expect(bytes('astc-6x6-unorm')).toEqual([27_869_184, 3_483_648, 435_456]);
    expect(bytes('bc4-r-unorm')).toEqual([31_352_832, 3_919_104, 489_888]);
    expect(bytes('r8unorm')).toEqual([62_705_664, 7_838_208, 979_776]);
  });

  it('base 2 starts at L2 as mip 0', () => {
    const levels = volumePyramidLevels(MCPM, 2, 'r8unorm');
    expect(levels.map((l) => [l.level, l.mip])).toEqual([
      [2, 0],
      [3, 1],
    ]);
  });
});
