import type { VolumePyramidSidecar } from '../../@types/data/volume/VolumePyramidSidecar';
import type { GpuVolume } from '../../@types/rendering/GpuVolume';

export function volumePyramidPlacement(
  sidecar: VolumePyramidSidecar,
  baseLevel: 1 | 2,
): Pick<GpuVolume, 'placement' | 'gain' | 'nativeBox'> {
  const { gridDims, voxelMpc, originMpc, frame, dataBox, levelMax } = sidecar;
  const { originVox, dims } = dataBox;
  return {
    placement: {
      frameKind: frame,
      rotation: [0, 0, 0, 1],
      origin: [
        originMpc[0] + originVox[0] * voxelMpc,
        originMpc[1] + originVox[1] * voxelMpc,
        originMpc[2] + originVox[2] * voxelMpc,
      ],
      voxelSize: voxelMpc * 2 ** baseLevel,
      dims: [dims[0] >> baseLevel, dims[1] >> baseLevel, dims[2] >> baseLevel],
    },
    gain: Math.log1p(levelMax[0]) / Math.log1p(levelMax[baseLevel]),
    nativeBox: {
      offset: [originVox[0] / gridDims[0], originVox[1] / gridDims[1], originVox[2] / gridDims[2]],
      scale: [dims[0] / gridDims[0], dims[1] / gridDims[1], dims[2] / gridDims[2]],
    },
  };
}
