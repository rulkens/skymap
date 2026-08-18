import type { GridBox } from '../../@types/GridBox';
import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { encodeScalarField } from '../../../../src/data/volume/scalarFieldFormat';
import { packLogTraceVoxels } from '../../../../src/utils/volume/packLogTraceVoxels';

// FRAME_TO_WORLD already applies the frame rotation at render time
// (buildRhizomeVolume.ts precedent) — writing it again here would compound it.
const IDENTITY_ROTATION: Vec4 = [0, 0, 0, 1];

/**
 * exportScfd — `packLogTraceVoxels` → `encodeScalarField`, the SAME packing
 * code `buildRhizomeVolume.ts` runs on the offline leg, so the two outputs
 * are diffable (spec §8 leg 2). Origin and voxel size come from the grid
 * box, not a sidecar's provenance fields — this leg has no sidecar.
 */
export function exportScfd(values: Float32Array, box: GridBox): ArrayBuffer {
  // `values` is a `readbackTrace()` widening — already grid.wesl's X-fastest
  // layout, not numpy C-order — so 'x-fastest' skips the packer's transpose
  // (which would otherwise swap X and Z a second time; see packLogTraceVoxels).
  const { voxels, valueMin, valueMax } = packLogTraceVoxels(values, box.dims, 'x-fastest');
  const origin: Vec3 = [
    box.centerMpc[0] - box.sizeMpc[0] / 2,
    box.centerMpc[1] - box.sizeMpc[1] / 2,
    box.centerMpc[2] - box.sizeMpc[2] / 2,
  ];
  const cube: ScalarCube = {
    dims: box.dims,
    channels: 1,
    voxels,
    frameKind: 'equatorial-cartesian',
    origin,
    voxelSize: box.voxelSizeMpc,
    rotation: IDENTITY_ROTATION,
    valueMin,
    valueMax,
  };
  return encodeScalarField(cube);
}
