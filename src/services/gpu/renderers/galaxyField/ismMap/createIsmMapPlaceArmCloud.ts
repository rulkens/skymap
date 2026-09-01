/**
 * createIsmMapPlaceArmCloud — the GPU placement kernel for the arm-cloud
 * tier. The CPU decides slot COUNT (`deriveArmCloudCount`, `armParticleCloud.ts`)
 * and the per-arm pick-weight table (`packArmCloudArmRecords.ts` ports
 * `armAgeWeight` verbatim); `placeArmCloud.wesl` decides slot CONTENT — the
 * arm pick, the rejection-sampled position, and the complex/child clumping
 * scatter. `dispatchPlaceArmCloud` rebuilds its bind group every call: the
 * per-arm records buffer is recreated whenever its byte size changes.
 */
import placeArmCloudWgsl from '../../../shaders/milkyWay/ismMap/placeArmCloud.wesl?static';

import {
  packPlaceArmCloudParams,
  PLACE_ARM_CLOUD_PARAMS_BUFFER_SIZE,
} from './packPlaceArmCloudParams';
import {
  ARM_CLOUD_ARM_RECORD_FLOATS,
  packArmCloudArmRecords,
} from './packArmCloudArmRecords';
import { createGrowOnlyRecordBuffer } from '../gpu/createGrowOnlyRecordBuffer';
import { discLightScaleLength } from '../../../../../utils/galaxy/discLightScaleLength';
import { armCrossSigma } from '../../../../engine/galaxyGenerator/v2/armRidgeGeometry';
import {
  ARM_CLOUD_MAX_COUNT,
  COMPLEX_HEIGHT_RATIO,
  COMPLEX_SPREAD_RATIO,
  tiltReferenceRadius,
} from '../../../../engine/galaxyGenerator/v2/armParticleCloud';
import {
  DISC_SIGMA_RATIOS,
  DISC_SURFACE_WEIGHTS,
} from '../../../../engine/galaxyGenerator/v2/discSurfaceFit';
import { FIELD_COMPONENT_FLOATS } from '../field/packFieldUniforms';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../@types/galaxy/GalaxyFieldTuning';

const PLACE_ARM_CLOUD_WORKGROUP_SIZE = 256;

export type PlaceArmCloudDispatchInput = {
  readonly seed: number;
  /** This galaxy's own absolute `fieldComps` slot offset — `GalaxyFieldMixtureResult.armCloudReservation.offset`, central-galaxy-only today. */
  readonly offset: number;
  readonly count: number;
  readonly flux: number;
  readonly geometry: GalaxyDescription;
  readonly tuning: GalaxyFieldTuning;
  /**
   * Dead pass-through for `buildClusteredDiscPlacementChild`'s mode 0u/1u
   * `orientationTex` parameter — this shader always dispatches mode 2u,
   * which never samples it (see `placeArmCloud.wesl`'s own doc). Reusing the
   * engine's EXISTING orientation texture costs nothing extra to bind.
   */
  readonly orientationTexture: GPUTexture;
  /** The LIVE fieldComps buffer — re-read after every regrow, never cached across calls. */
  readonly fieldCompsBuffer: GPUBuffer;
};

export type IsmMapPlaceArmCloud = {
  /** Encode into the CALLER's encoder/pass — no submit here (one-encoder-one-submit discipline). */
  dispatchPlaceArmCloud(enc: GPUCommandEncoder, input: PlaceArmCloudDispatchInput): void;
  /**
   * Debug-only: dispatch in its own encoder/submit and map the reservation's
   * slot range straight back — the probe's determinism/budget/liveness
   * exception, no production caller. `fluxWeight` is `fluxWeightBuffer`'s own
   * `[0, count)` slice, read back alongside `records` so the probe can
   * independently recompute `weightSum` off the SAME dispatch rather than a
   * second, potentially different one.
   */
  dispatchAndReadbackArmCloud(
    input: PlaceArmCloudDispatchInput,
  ): Promise<{ readonly records: Float32Array; readonly fluxWeight: Float32Array }>;
  /**
   * `fluxWeightOut` (placeArmCloud.wesl binding 5) — ARM_CLOUD_MAX_COUNT
   * floats, one per particle slot. Exposed so `ringReduce.wesl`'s
   * csArmCloudFluxWeightSum kernel (dispatched separately, off
   * `createGalaxyFieldRenderer.ts`'s own `ringReduce` instance) can bind the SAME
   * buffer this dispatch just filled — `IsmMapPlaceDust.massBuffer`'s own
   * producer-owns-the-buffer precedent.
   */
  readonly fluxWeightBuffer: GPUBuffer;
  dispose(): void;
};

export function createIsmMapPlaceArmCloud(
  device: GPUDevice,
  deps: { readonly makeShader: (code: string, label: string) => GPUShaderModule },
): IsmMapPlaceArmCloud {
  const mod = deps.makeShader(placeArmCloudWgsl, 'galaxy:placeArmCloud');
  const pipeline = device.createComputePipeline({
    label: 'galaxy:placeArmCloudPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'cs' },
  });
  const paramsBuffer = device.createBuffer({
    label: 'galaxy:placeArmCloudParams',
    size: PLACE_ARM_CLOUD_PARAMS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Also bound (reinterpreted as `array<f32>`) at placeArmCloud.wesl's own
  // dead `passThroughPrefixBuf` binding — see that file's own doc.
  const recordsBuffer = createGrowOnlyRecordBuffer({
    device,
    label: 'galaxy:placeArmCloudRecords',
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    floatsPerRecord: ARM_CLOUD_ARM_RECORD_FLOATS,
    initialCapacity: 1,
  });
  const readbackByteSize = ARM_CLOUD_MAX_COUNT * FIELD_COMPONENT_FLOATS * 4;
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:placeArmCloudReadback',
    size: readbackByteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // fluxWeightOut — see IsmMapPlaceArmCloud.fluxWeightBuffer's own doc above.
  const fluxWeightBuffer = device.createBuffer({
    label: 'galaxy:placeArmCloudFluxWeight',
    size: ARM_CLOUD_MAX_COUNT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const fluxWeightReadbackBuffer = device.createBuffer({
    label: 'galaxy:placeArmCloudFluxWeightReadback',
    size: ARM_CLOUD_MAX_COUNT * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  /**
   * Encodes the dispatch, or returns null when there is nothing to place —
   * `geometry.arms.length === 0` (no arms this galaxy) or `weightSum <= 0`
   * (every pick weight collapsed) both mean `placeArmCloud.wesl`'s weighted
   * pick would divide by an inert or empty table — mirrors
   * `createIsmMapPlaceArmSpurCloud.ts`'s identical guard.
   */
  function encode(enc: GPUCommandEncoder, input: PlaceArmCloudDispatchInput): boolean {
    if (input.count <= 0 || input.geometry.arms.length === 0) return false;
    const { buffer: recordsData, weightSum } = packArmCloudArmRecords(input.geometry.arms);
    if (!(weightSum > 0)) return false;

    recordsBuffer.write(recordsData);
    const buf = recordsBuffer.buffer;

    const { geometry, tuning } = input;
    const hLight = discLightScaleLength(geometry);
    const cloud = tuning.arms.cloud;
    device.queue.writeBuffer(
      paramsBuffer,
      0,
      packPlaceArmCloudParams({
        seed: input.seed,
        count: input.count,
        armCount: geometry.arms.length,
        reservationOffset: input.offset,
        childrenPerComplex: Math.max(1, Math.round(1 + 15 * cloud.clumpiness)),
        armWeightSum: weightSum,
        elongation: cloud.elongation,
        sizeScale: cloud.sizeScale,
        complexSpread: armCrossSigma(hLight, geometry, tuning) * COMPLEX_SPREAD_RATIO,
        sigmaZComplex: geometry.diskHeight * COMPLEX_HEIGHT_RATIO,
        widthScale: tuning.arms.widthScale,
        excessScaleRatio: tuning.arms.excessScaleRatio,
        hLight,
        tiltRefRadius: tiltReferenceRadius(geometry),
        radialBias: Math.max(0, cloud.radialBias),
        youngFraction: geometry.youngFraction,
        discSigmaR: [
          DISC_SIGMA_RATIOS[0] * hLight,
          DISC_SIGMA_RATIOS[1] * hLight,
          DISC_SIGMA_RATIOS[2] * hLight,
          DISC_SIGMA_RATIOS[3] * hLight,
        ],
        discWeightSum: DISC_SURFACE_WEIGHTS.reduce((s, w) => s + w, 0),
        warpStrength: geometry.warpStrength,
        warpTwist: geometry.warpTwist,
        warpStartRadius: geometry.warpStartRadius,
        outerRadius: geometry.outerRadius,
        armStartRadius: geometry.armStartRadius,
        armInnerRampW: geometry.armInnerRampW,
        armFullRadius: geometry.armFullRadius,
        waveAmount: geometry.waveAmount,
        diskScaleLen: geometry.diskScaleLen,
        cloudFlux: input.flux,
      }),
    );

    const bindGroup = device.createBindGroup({
      label: 'galaxy:placeArmCloudBG',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: buf } },
        { binding: 2, resource: input.orientationTexture.createView() },
        { binding: 3, resource: { buffer: input.fieldCompsBuffer } },
        { binding: 4, resource: { buffer: buf } },
        { binding: 5, resource: { buffer: fluxWeightBuffer } },
      ],
    });
    const pass = enc.beginComputePass({ label: 'galaxy:placeArmCloudPass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(input.count / PLACE_ARM_CLOUD_WORKGROUP_SIZE));
    pass.end();
    return true;
  }

  return {
    dispatchPlaceArmCloud(enc, input): void {
      encode(enc, input);
    },

    async dispatchAndReadbackArmCloud(
      input,
    ): Promise<{ readonly records: Float32Array; readonly fluxWeight: Float32Array }> {
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmCloudDebugDispatch' });
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
      recordsBuffer.destroy();
      readbackBuffer.destroy();
      fluxWeightBuffer.destroy();
      fluxWeightReadbackBuffer.destroy();
    },
  };
}
