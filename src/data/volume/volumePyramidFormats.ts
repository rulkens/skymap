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
  },
  {
    format: 'bc4',
    gpuFormat: 'bc4-r-unorm',
    blockEdge: 4,
    features: ['texture-compression-bc', 'texture-compression-bc-sliced-3d'],
  },
  { format: 'r8', gpuFormat: 'r8unorm', blockEdge: 1, features: [] },
];
