/**
 * createFlowField — loads the CF4++ velocity flow field asset onto the GPU.
 *
 * Three exports, in increasing scope:
 *
 *   - `flowFieldMetaFromCube(cube)` — pure cube → `FlowFieldMeta` mapping
 *     (no GPU device); unit-testable in isolation.
 *   - `flowFieldFromCube(device, cube)` — synchronous cube → `FlowField`
 *     GPU upload (texture + sampler), no fetch.
 *   - `createFlowField(device, scfdUrl)` — the URL loader: fetch → decode →
 *     `flowFieldFromCube`.
 *
 * Why the cube → GPU upload is factored out of the URL loader: the demand-
 * driven flow asset slot fetches the `.scfd` itself, through the slot's own
 * progress/abort machinery (`fetchWithProgress`), then needs to upload the
 * already-decoded `ScalarCube` without a second network round-trip.  Calling
 * `createFlowField` from the slot would re-fetch the blob; `flowFieldFromCube`
 * lets the slot hand its cube straight to the GPU.  Phase E's workbench still
 * wants the URL form, so `createFlowField` stays and simply delegates.
 *
 * Both upload paths fetch a single self-describing `flowfield.scfd` (SCFD v3,
 * `channels = 4`, `value_kind = 1`) and upload its voxels as an N³
 * `rgba16float` 3D texture — rgb = velocity (km/s) in the cube's native frame,
 * a = overdensity δ — then return the shared `FlowField` handle the engine
 * hands to every flow layer.
 *
 * The earlier cosmic-flow tool (`tools/cosmic-flow/.../createVelocityField.ts`)
 * fetched a `.json` metadata sidecar alongside the `.bin` blob and carried a
 * `boxMpcPerH` box size.  SCFD v3 dissolves that split: the frame (origin,
 * voxel size, frame kind) AND the velocity stats fold into the binary header,
 * so the loader reads every metadata field straight off the decoded cube.  No
 * second request, no `boxMpcPerH` — the cube already speaks Mpc via `origin` +
 * `voxelSize`.
 *
 * The voxel buffer is C-order `[z][y][x][c]` f16 RGBA (x fastest, z outer),
 * exactly the layout WebGPU's `writeTexture` walks with
 * `bytesPerRow = n * 4 channels * 2 bytes` and `rowsPerImage = n`.  The cube's
 * `Uint16Array` holds the raw 2-byte f16 representation, so the upload is a
 * straight copy with no per-element conversion.
 */

import type { FlowField } from '../../../@types/data/FlowField';
import type { FlowFieldMeta } from '../../../@types/data/FlowFieldMeta';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import { decodeScalarField, gpuTextureFormatForChannels } from '../../../data/scalarFieldFormat';

/**
 * Map a decoded velocity cube to its `FlowFieldMeta`.
 *
 * Pure and exported so the mapping can be unit-tested without a `GPUDevice`.
 * Throws if the cube is not a velocity + overdensity field — i.e. anything but
 * a 4-channel cube carrying `velocityStats` (the in-memory mirror of the SCFD
 * `value_kind = 1` discriminator).  A plain scalar density cube, or a bare
 * 4-channel cube with no stats, cannot drive the flow layer's speed / seeding
 * normalisation, so loading it as a flow field is a programming error we fail
 * loudly on rather than silently producing a degenerate field.
 */
export function flowFieldMetaFromCube(cube: ScalarCube): FlowFieldMeta {
  if (cube.channels !== 4 || cube.velocityStats === undefined) {
    throw new Error(
      `createFlowField: expected a velocity field (channels === 4 with velocityStats), ` +
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

/**
 * Upload an already-decoded velocity cube to the GPU and return its
 * `FlowField` handle.  Synchronous — no fetch — so a caller that already holds
 * the cube (the demand-driven asset slot, which fetched it through its own
 * progress/abort machinery) can upload without a redundant network round-trip.
 */
export function flowFieldFromCube(device: GPUDevice, cube: ScalarCube): FlowField {
  const meta = flowFieldMetaFromCube(cube);

  const n = meta.n;
  const texture = device.createTexture({
    size: [n, n, n],
    dimension: '3d',
    format: gpuTextureFormatForChannels(cube.channels),
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // bytesPerRow = n voxels * 4 channels * 2 bytes (f16); rowsPerImage = n.
  device.queue.writeTexture(
    { texture },
    cube.voxels,
    { bytesPerRow: n * 4 * 2, rowsPerImage: n },
    [n, n, n],
  );

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  return {
    textureView: texture.createView(),
    sampler,
    meta,
    dispose: () => texture.destroy(),
  };
}

export async function createFlowField(device: GPUDevice, scfdUrl: string): Promise<FlowField> {
  const buf = await (await fetch(scfdUrl)).arrayBuffer();
  const cube = decodeScalarField(buf);
  return flowFieldFromCube(device, cube);
}
