/**
 * flowFieldMetaFromCube — map a decoded velocity cube to its `FlowFieldMeta`.
 *
 * Pure and device-free so the mapping is unit-testable without a `GPUDevice`.
 * Throws if the cube is not a velocity + overdensity field — i.e. anything but
 * a 4-channel cube carrying `velocityStats` (the in-memory mirror of the SCFD
 * `value_kind = 1` discriminator).  A plain scalar density cube, or a bare
 * 4-channel cube with no stats, cannot drive the flow layer's speed / seeding
 * normalisation, so loading it as a flow field is a programming error we fail
 * loudly on rather than silently producing a degenerate field.
 *
 * The cube is self-describing (SCFD v3): the frame (origin, voxel size, frame
 * kind) AND the velocity stats fold into the binary header, so every metadata
 * field reads straight off the decoded cube — no sidecar, no `boxMpcPerH`. The
 * cube already speaks Mpc via `origin` + `voxelSize`.
 */

import type { FlowFieldMeta } from '../../../@types/data/FlowFieldMeta';
import type { ScalarCube } from '../../../@types/data/ScalarCube';

export function flowFieldMetaFromCube(cube: ScalarCube): FlowFieldMeta {
  if (cube.channels !== 4 || cube.velocityStats === undefined) {
    throw new Error(
      `flowFieldMetaFromCube: expected a velocity field (channels === 4 with velocityStats), ` +
        `got channels === ${cube.channels}, velocityStats ` +
        `${cube.velocityStats === undefined ? 'absent' : 'present'}.`,
    );
  }

  return {
    n: cube.dims[0],
    origin: cube.origin,
    voxelSizeMpc: cube.voxelSize,
    frameKind: cube.frameKind,
    deltaMin: cube.valueMin,
    deltaMax: cube.valueMax,
    speedKmsMax: cube.velocityStats.speedKmsMax,
    speedKmsP99: cube.velocityStats.speedKmsP99,
    deltaP99: cube.velocityStats.deltaP99,
  };
}
