/**
 * createIsmMapPlaceArmSpurCloud — GPU replacement for the CPU's former
 * `buildArmSpurParticleCloud` placement body (`armSpurParticleCloud.ts`
 * survives only as `spurFootprintIntegral`/`deriveArmSpurCloudCount`'s
 * budget math). The CPU still decides slot COUNT and the per-spur
 * pick-weight table (`galaxyFieldMixture.ts`'s `spurCloudReservation`,
 * `packArmSpurCloudRecords.ts`);
 * `placeArmSpurCloud.wesl` decides slot CONTENT — the weighted spur pick,
 * the rejection-sampled position, the Gaussian cross/pole scatter.
 *
 * `dispatchPlaceArmSpurCloud` rebuilds its bind group every call
 * (`createIsmMapPlaceDust.ts`'s own precedent): the per-spur records buffer
 * is recreated whenever its byte size changes (spur COUNT moves with
 * geometry/tuning), so pooling it buys nothing a growable buffer wouldn't
 * already cost less to reason about. `dispatchAndReadbackArmSpurCloud` is
 * the probe's own numeric/determinism exception — no production caller.
 */
import placeArmSpurCloudWgsl from '../../../shaders/milkyWay/ismMap/placeArmSpurCloud.wesl?static';

import {
  packPlaceArmSpurCloudParams,
  PLACE_ARM_SPUR_CLOUD_PARAMS_BUFFER_SIZE,
} from './packPlaceArmSpurCloudParams';
import { packArmSpurCloudRecords } from './packArmSpurCloudRecords';
import { discLightScaleLength } from '../../../../../utils/galaxy/discLightScaleLength';
import { FIELD_COMPONENT_FLOATS } from '../field/packFieldUniforms';
import { SPUR_CLOUD_MAX_COUNT } from '../../../../engine/galaxyGenerator/v2/armSpurParticleCloud';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldTuning } from '../../../../../@types/galaxy/GalaxyFieldTuning';

const PLACE_ARM_SPUR_CLOUD_WORKGROUP_SIZE = 256;

export type PlaceArmSpurCloudDispatchInput = {
  readonly seed: number;
  /** This galaxy's own absolute `fieldComps` slot offset — `GalaxyFieldMixtureResult.spurCloudReservation.offset`, central-galaxy-only today. */
  readonly offset: number;
  readonly count: number;
  readonly flux: number;
  readonly spurArms: readonly GalaxyFieldArmRecord[];
  readonly geometry: GalaxyDescription;
  readonly tuning: GalaxyFieldTuning;
  /** The LIVE fieldComps buffer — re-read after every regrow, never cached across calls. */
  readonly fieldCompsBuffer: GPUBuffer;
};

export type IsmMapPlaceArmSpurCloud = {
  /** Encode into the CALLER's encoder/pass — no submit here (one-encoder-one-submit discipline). */
  dispatchPlaceArmSpurCloud(enc: GPUCommandEncoder, input: PlaceArmSpurCloudDispatchInput): void;
  /**
   * Debug-only: dispatch in its own encoder/submit and map the reservation's
   * slot range straight back — the probe's determinism/budget/liveness
   * exception, no production caller. `fluxWeight` is `fluxWeightBuffer`'s own
   * `[0, count)` slice, read back alongside `records` —
   * `createIsmMapPlaceArmCloud.ts`'s own identical precedent.
   */
  dispatchAndReadbackArmSpurCloud(
    input: PlaceArmSpurCloudDispatchInput,
  ): Promise<{ readonly records: Float32Array; readonly fluxWeight: Float32Array }>;
  /** `fluxWeightOut` (placeArmSpurCloud.wesl binding 3) — SPUR_CLOUD_MAX_COUNT floats, one per particle slot. */
  readonly fluxWeightBuffer: GPUBuffer;
  dispose(): void;
};

export function createIsmMapPlaceArmSpurCloud(
  device: GPUDevice,
  deps: { readonly makeShader: (code: string, label: string) => GPUShaderModule },
): IsmMapPlaceArmSpurCloud {
  const mod = deps.makeShader(placeArmSpurCloudWgsl, 'galaxy:placeArmSpurCloud');
  const pipeline = device.createComputePipeline({
    label: 'galaxy:placeArmSpurCloudPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'cs' },
  });
  const paramsBuffer = device.createBuffer({
    label: 'galaxy:placeArmSpurCloudParams',
    size: PLACE_ARM_SPUR_CLOUD_PARAMS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Recreated whenever spur count grows past the current capacity — never
  // shrunk, the `createGrowOnlyRecordBuffer` idiom minus the growable
  // wrapper (this buffer holds no cross-rebuild state to preserve on regrow).
  let recordsBuffer: GPUBuffer | null = null;
  const readbackByteSize = SPUR_CLOUD_MAX_COUNT * FIELD_COMPONENT_FLOATS * 4;
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:placeArmSpurCloudReadback',
    size: readbackByteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // fluxWeightOut — see IsmMapPlaceArmSpurCloud.fluxWeightBuffer's own doc above.
  const fluxWeightBuffer = device.createBuffer({
    label: 'galaxy:placeArmSpurCloudFluxWeight',
    size: SPUR_CLOUD_MAX_COUNT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const fluxWeightReadbackBuffer = device.createBuffer({
    label: 'galaxy:placeArmSpurCloudFluxWeightReadback',
    size: SPUR_CLOUD_MAX_COUNT * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  function ensureRecordsBuffer(byteSize: number): GPUBuffer {
    if (recordsBuffer && recordsBuffer.size >= byteSize) return recordsBuffer;
    recordsBuffer?.destroy();
    recordsBuffer = device.createBuffer({
      label: 'galaxy:placeArmSpurCloudRecords',
      size: Math.max(byteSize, 32),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    return recordsBuffer;
  }

  /**
   * Encodes the dispatch, or returns null when there is nothing to place —
   * `spurArms.length === 0` (no roots this galaxy) or `weightSum <= 0` (every
   * pick weight collapsed, `armSpurParticleCloud.ts`'s own `!(weightSum > 0)`
   * bail-out) both mean `placeArmSpurCloud.wesl`'s weighted pick would divide
   * by an inert or empty table — the CPU-side guard mirrors that early
   * return rather than letting the shader index an empty array.
   */
  function encode(enc: GPUCommandEncoder, input: PlaceArmSpurCloudDispatchInput): boolean {
    if (input.count <= 0 || input.spurArms.length === 0) return false;
    const { buffer: recordsData, weightSum } = packArmSpurCloudRecords(
      input.spurArms,
      input.geometry,
      input.tuning,
    );
    if (!(weightSum > 0)) return false;

    const buf = ensureRecordsBuffer(recordsData.byteLength);
    device.queue.writeBuffer(buf, 0, recordsData);

    const { geometry, tuning } = input;
    device.queue.writeBuffer(
      paramsBuffer,
      0,
      packPlaceArmSpurCloudParams({
        seed: input.seed,
        count: input.count,
        spurCount: input.spurArms.length,
        reservationOffset: input.offset,
        spurFlux: input.flux,
        weightSum,
        elongation: tuning.arms.spurs.elongation,
        sizeScale: tuning.arms.spurs.sizeScale,
        widthScale: tuning.arms.widthScale,
        excessScaleRatio: tuning.arms.excessScaleRatio,
        hLight: discLightScaleLength(geometry),
        diskHeight: geometry.diskHeight,
        armStartRadius: geometry.armStartRadius,
        armInnerRampW: geometry.armInnerRampW,
        armFullRadius: geometry.armFullRadius,
        waveAmount: geometry.waveAmount,
        diskScaleLen: geometry.diskScaleLen,
        warpStrength: geometry.warpStrength,
        warpTwist: geometry.warpTwist,
        warpStartRadius: geometry.warpStartRadius,
        outerRadius: geometry.outerRadius,
      }),
    );

    const bindGroup = device.createBindGroup({
      label: 'galaxy:placeArmSpurCloudBG',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: buf } },
        { binding: 2, resource: { buffer: input.fieldCompsBuffer } },
        { binding: 3, resource: { buffer: fluxWeightBuffer } },
      ],
    });
    const pass = enc.beginComputePass({ label: 'galaxy:placeArmSpurCloudPass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(input.count / PLACE_ARM_SPUR_CLOUD_WORKGROUP_SIZE));
    pass.end();
    return true;
  }

  return {
    dispatchPlaceArmSpurCloud(enc, input): void {
      encode(enc, input);
    },

    async dispatchAndReadbackArmSpurCloud(
      input,
    ): Promise<{ readonly records: Float32Array; readonly fluxWeight: Float32Array }> {
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmSpurCloudDebugDispatch' });
      if (!encode(enc, input)) {
        return { records: new Float32Array(0), fluxWeight: new Float32Array(0) };
      }
      const byteSize = input.count * FIELD_COMPONENT_FLOATS * 4;
      const byteOffset = input.offset * FIELD_COMPONENT_FLOATS * 4;
      enc.copyBufferToBuffer(input.fieldCompsBuffer, byteOffset, readbackBuffer, 0, byteSize);
      const fluxWeightByteSize = input.count * 4;
      enc.copyBufferToBuffer(fluxWeightBuffer, 0, fluxWeightReadbackBuffer, 0, fluxWeightByteSize);
      device.queue.submit([enc.finish()]);

      await Promise.all([
        readbackBuffer.mapAsync(GPUMapMode.READ, 0, byteSize),
        fluxWeightReadbackBuffer.mapAsync(GPUMapMode.READ, 0, fluxWeightByteSize),
      ]);
      try {
        return {
          records: new Float32Array(readbackBuffer.getMappedRange(0, byteSize).slice(0)),
          fluxWeight: new Float32Array(
            fluxWeightReadbackBuffer.getMappedRange(0, fluxWeightByteSize).slice(0),
          ),
        };
      } finally {
        readbackBuffer.unmap();
        fluxWeightReadbackBuffer.unmap();
      }
    },

    fluxWeightBuffer,

    dispose(): void {
      paramsBuffer.destroy();
      recordsBuffer?.destroy();
      readbackBuffer.destroy();
      fluxWeightBuffer.destroy();
      fluxWeightReadbackBuffer.destroy();
    },
  };
}
