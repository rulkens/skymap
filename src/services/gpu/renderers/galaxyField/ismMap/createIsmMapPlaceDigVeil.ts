/**
 * createIsmMapPlaceDigVeil — the GPU placement kernel for the DIG veil,
 * mirroring `buildDigVeil`'s complex/children placement loop (`hiiRegions.ts`).
 * The CPU decides slot COUNT (`computeDigVeilBudget.ts`); `placeDigVeil.wesl`
 * decides slot CONTENT, including the map-usability gate itself (`usesMap`),
 * so nothing on this path depends on a CPU `ismMap` readback.
 * `dispatchPlaceDigVeil` rebuilds its bind group every call: the CDF prefix
 * buffer and `hiiComps` buffer can both change identity.
 */
import placeDigVeilWgsl from '../../../shaders/milkyWay/ismMap/placeDigVeil.wesl?static';

import {
  packPlaceDigVeilParams,
  PLACE_DIG_VEIL_PARAMS_BUFFER_SIZE,
} from './packPlaceDigVeilParams';
import type { PlaceDigVeilParamsInput } from './packPlaceDigVeilParams';
import type { DigVeilBudget } from './computeDigVeilBudget';
import { FIELD_COMPONENT_FLOATS } from '../field/packFieldUniforms';
import { DIG_MAX_COUNT } from '../../../../engine/galaxyGenerator/v2/hiiRegions';

const PLACE_DIG_VEIL_WORKGROUP_SIZE = 256;

export type PlaceDigVeilWarp = {
  readonly warpStrength: number;
  readonly warpTwist: number;
  readonly warpStartRadius: number;
  readonly outerRadius: number;
};

export type PlaceDigVeilDispatchInput = {
  readonly seed: number;
  readonly budget: DigVeilBudget;
  readonly reservationOffset: number;
  readonly generatorIsFluid: boolean;
  readonly cdfRings: number;
  readonly cdfAz: number;
  readonly cdfRMin: number;
  readonly cdfRMax: number;
  readonly warp: PlaceDigVeilWarp;
  /** The DIG-dedicated arm-biased CDF scan's output — see `createGalaxyModel.ts`'s `digCdfScan`. Own instance/buffer from dust's, never shared (two weight tables writing the same buffer would race across the two tiers' own deferred dispatches). */
  readonly prefixBuffer: GPUBuffer;
  /** The LIVE `hiiComps` buffer — re-read after every regrow, never cached across calls. */
  readonly hiiCompsBuffer: GPUBuffer;
};

export type IsmMapPlaceDigVeil = {
  /** Encode into the CALLER's encoder/pass — no submit here (one-encoder-one-submit discipline). */
  dispatchPlaceDigVeil(enc: GPUCommandEncoder, input: PlaceDigVeilDispatchInput): void;
  /** Debug-only: dispatch in its own encoder/submit and map the DIG slot range straight back — the probe's determinism/liveness/flux-parity exception, no production caller. */
  dispatchAndReadbackDigVeil(input: PlaceDigVeilDispatchInput): Promise<Float32Array>;
  dispose(): void;
};

function toUniformInput(input: PlaceDigVeilDispatchInput): PlaceDigVeilParamsInput {
  const { budget } = input;
  return {
    seed: input.seed,
    count: budget.count,
    childrenPerComplex: budget.childrenPerComplex,
    reservationOffset: input.reservationOffset,
    generatorIsFluid: input.generatorIsFluid,
    cdfRings: input.cdfRings,
    cdfAz: input.cdfAz,
    cdfRMin: input.cdfRMin,
    cdfRMax: input.cdfRMax,
    complexSpread: budget.complexSpread,
    elongation: budget.elongation,
    coherence: budget.coherence,
    amplitudeBase: budget.amplitudeBase,
    scaleHeight: budget.scaleHeight,
    sigmaMin: budget.sigmaMin,
    sigmaMax: budget.sigmaMax,
    textureWeight: budget.textureWeight,
    warpStrength: input.warp.warpStrength,
    warpTwist: input.warp.warpTwist,
    warpStartRadius: input.warp.warpStartRadius,
    outerRadius: input.warp.outerRadius,
    color: budget.color,
  };
}

export function createIsmMapPlaceDigVeil(
  device: GPUDevice,
  deps: { readonly makeShader: (code: string, label: string) => GPUShaderModule },
): IsmMapPlaceDigVeil {
  const mod = deps.makeShader(placeDigVeilWgsl, 'galaxy:placeDigVeil');
  const pipeline = device.createComputePipeline({
    label: 'galaxy:placeDigVeilPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'cs' },
  });
  const paramsBuffer = device.createBuffer({
    label: 'galaxy:placeDigVeilParams',
    size: PLACE_DIG_VEIL_PARAMS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const readbackByteSize = DIG_MAX_COUNT * FIELD_COMPONENT_FLOATS * 4;
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:placeDigVeilReadback',
    size: readbackByteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  function encode(enc: GPUCommandEncoder, input: PlaceDigVeilDispatchInput): void {
    const { budget } = input;
    device.queue.writeBuffer(paramsBuffer, 0, packPlaceDigVeilParams(toUniformInput(input)));
    const bindGroup = device.createBindGroup({
      label: 'galaxy:placeDigVeilBG',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: input.prefixBuffer } },
        { binding: 2, resource: { buffer: input.hiiCompsBuffer } },
      ],
    });
    const pass = enc.beginComputePass({ label: 'galaxy:placeDigVeilPass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(budget.count / PLACE_DIG_VEIL_WORKGROUP_SIZE));
    pass.end();
  }

  return {
    dispatchPlaceDigVeil(enc, input): void {
      if (input.budget.count <= 0) return;
      encode(enc, input);
    },

    async dispatchAndReadbackDigVeil(input): Promise<Float32Array> {
      const { budget } = input;
      if (budget.count <= 0) return new Float32Array(0);
      const enc = device.createCommandEncoder({ label: 'galaxy:placeDigVeilDebugDispatch' });
      encode(enc, input);
      const byteSize = budget.count * FIELD_COMPONENT_FLOATS * 4;
      const byteOffset = input.reservationOffset * FIELD_COMPONENT_FLOATS * 4;
      enc.copyBufferToBuffer(input.hiiCompsBuffer, byteOffset, readbackBuffer, 0, byteSize);
      device.queue.submit([enc.finish()]);

      await readbackBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);
      try {
        return new Float32Array(readbackBuffer.getMappedRange(0, byteSize).slice(0));
      } finally {
        readbackBuffer.unmap();
      }
    },

    dispose(): void {
      paramsBuffer.destroy();
      readbackBuffer.destroy();
    },
  };
}
