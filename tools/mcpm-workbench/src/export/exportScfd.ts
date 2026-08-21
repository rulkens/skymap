import type { GridBox } from '../../@types/GridBox';
import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { encodeScalarField } from '../../../../src/data/volume/scalarFieldFormat';
import { packLogTraceVoxels } from '../../../../src/utils/volume/packLogTraceVoxels';
import { boxHalfExtentMpc } from '../field/boxHalfExtentMpc';

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
  const half = boxHalfExtentMpc(box.sizeMpc);
  const origin: Vec3 = [
    box.centerMpc[0] - half[0],
    box.centerMpc[1] - half[1],
    box.centerMpc[2] - half[2],
  ];
  const cube: ScalarCube = {
    dims: box.dims,
    channels: 1,
    voxels,
    frameKind: 'equatorial-cartesian',
    origin,
    voxelSize: box.voxelSizeMpc,
    // Box tilt, not frame conversion — frameKind is 'equatorial-cartesian'
    // (FRAME_TO_WORLD identity), so buildCubeModelMatrix composes box.rotation
    // on top of nothing. This is the field's documented per-cube-tilt use
    // (buildCf4Density.ts:197-207); shipping identity here would silently
    // axis-align every rotated box on import.
    rotation: [box.rotation[0], box.rotation[1], box.rotation[2], box.rotation[3]] as Vec4,
    valueMin,
    valueMax,
  };
  return encodeScalarField(cube);
}
