import type { VolumePyramidFormatRow } from '../../@types/data/volume/VolumePyramidFormatRow';

/**
 * Preference order: the first row whose features the device has wins. A plain
 * `texture-compression-*` without its `-sliced-3d` partner does not allow a 3D texture.
 */
export const VOLUME_PYRAMID_FORMATS: readonly VolumePyramidFormatRow[] = [
  {
    format: 'astc6',
    gpuFormat: 'astc-6x6-unorm',
    blockEdge: 6,
    features: ['texture-compression-astc', 'texture-compression-astc-sliced-3d'],
    // Void extent, LDR, value 0.
    zeroBlock: new Uint8Array([
      0xfc, 0xfd, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0xff, 0xff,
    ]),
  },
  {
    format: 'bc4',
    gpuFormat: 'bc4-r-unorm',
    blockEdge: 4,
    features: ['texture-compression-bc', 'texture-compression-bc-sliced-3d'],
    zeroBlock: new Uint8Array(8),
  },
  { format: 'r8', gpuFormat: 'r8unorm', blockEdge: 1, features: [], zeroBlock: new Uint8Array(1) },
];
