/**
 * createIsmMapPlaceDust — the GPU placement kernel for map-seeded dust. The
 * CPU decides slot COUNT (`computePlaceDustBudget` below); `placeDust.wesl`
 * decides slot CONTENT, including the mapDensity/smoothDisc MODE itself, so
 * nothing on this path depends on an async ismMap readback landing.
 * `dispatchPlaceDust` rebuilds its bind group every call: the CDF prefix
 * buffer, ring-means buffer and `fieldComps` buffer can all change identity
 * (a growable record buffer regrows; the ISM-map generator's own buffers are
 * stable but this keeps one discipline, not two).
 */
import placeDustWgsl from '../../../shaders/milkyWay/ismMap/placeDust.wesl?static';

import { packPlaceDustParams, PLACE_DUST_PARAMS_BUFFER_SIZE } from './packPlaceDustParams';
import type { PlaceDustParamsInput } from './packPlaceDustParams';
import type { PlaceDustBudget } from './computePlaceDustBudget';
import { FIELD_COMPONENT_FLOATS } from '../field/packFieldUniforms';
import { MAX_PARTICLE_COUNT } from '../../../../engine/galaxyGenerator/v2/dustParticleCloud';

const PLACE_DUST_WORKGROUP_SIZE = 256;

export type PlaceDustGrid = {
  readonly rings: number;
  readonly az: number;
  readonly rMin: number;
  readonly rMax: number;
};

export type PlaceDustWarp = {
  readonly warpStrength: number;
  readonly warpTwist: number;
  readonly warpStartRadius: number;
  readonly outerRadius: number;
};

export type PlaceDustDispatchInput = {
  readonly seed: number;
  readonly budget: PlaceDustBudget;
  readonly dustOffset: number;
  readonly generatorIsFluid: boolean;
  readonly grid: PlaceDustGrid;
  readonly warp: PlaceDustWarp;
  /** The CDF scan output over the dust channel — see createIsmMapDustCdfScan.ts. */
  readonly prefixBuffer: GPUBuffer;
  /** ismMapGenerator.ringMeansBuffer — ringReduce.wesl's per-ring dust means. */
  readonly ringMeansBuffer: GPUBuffer;
  readonly ismMapTexture: GPUTexture;
  readonly orientationTexture: GPUTexture;
  readonly fieldCompsBuffer: GPUBuffer;
};

export type IsmMapPlaceDust = {
  /** Encode into the CALLER's encoder/pass — no submit here (one-encoder-one-submit discipline). */
  dispatchPlaceDust(enc: GPUCommandEncoder, input: PlaceDustDispatchInput): void;
  /**
   * Debug-only: dispatch in its own encoder/submit and map the dust slot
   * range straight back — the probe's determinism/survival-floor exception,
   * no production caller. `mass` is `massBuffer`'s own `[0, count)` slice,
   * read back alongside `records` so the probe can independently recompute
   * `sumR2` off the SAME dispatch rather than a second, potentially
   * different one.
   */
  dispatchAndReadbackDust(
    input: PlaceDustDispatchInput,
  ): Promise<{ readonly records: Float32Array; readonly mass: Float32Array }>;
  /**
   * `massOut` (placeDust.wesl binding 6) — the survivor-sum input,
   * MAX_PARTICLE_COUNT floats, one per particle slot, zeroed on a
   * survival-floor miss (mirrors `comps`' amplitude-as-liveness). Exposed so
   * `ringReduce.wesl`'s csSurvivorSum kernel (dispatched separately, off
   * `createGalaxyFieldRenderer.ts`'s own `ringReduce` instance) can bind the SAME
   * buffer this dispatch just filled — producer-owns-the-buffer, same
   * ownership shape `ismMapGenerator.ringMeansBuffer` already establishes
   * for `placeDust.wesl`'s own CONSUMED input.
   */
  readonly massBuffer: GPUBuffer;
  dispose(): void;
};

function toUniformInput(input: PlaceDustDispatchInput): PlaceDustParamsInput {
  const { budget } = input;
  return {
    seed: input.seed,
    count: budget.count,
    childrenPerComplex: budget.childrenPerComplex,
    generatorIsFluid: input.generatorIsFluid,
    dustOffset: input.dustOffset,
    gridRings: input.grid.rings,
    gridAz: input.grid.az,
    rMin: input.grid.rMin,
    rMax: input.grid.rMax,
    complexSpread: budget.complexSpread,
    elongation: budget.elongation,
    sigmaZComplex: budget.sigmaZComplex,
    discWeightSum: budget.discWeightSum,
    sizeMin: budget.sizeMin,
    sizeMax: budget.sizeMax,
    discSigmaR: budget.discSigmaR,
    warpStrength: input.warp.warpStrength,
    warpTwist: input.warp.warpTwist,
    warpStartRadius: input.warp.warpStartRadius,
    outerRadius: input.warp.outerRadius,
    extinctionRgb: budget.extinctionRgb,
  };
}

export function createIsmMapPlaceDust(
  device: GPUDevice,
  deps: { readonly makeShader: (code: string, label: string) => GPUShaderModule },
): IsmMapPlaceDust {
  const mod = deps.makeShader(placeDustWgsl, 'galaxy:placeDust');
  const pipeline = device.createComputePipeline({
    label: 'galaxy:placeDustPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'cs' },
  });
  const paramsBuffer = device.createBuffer({
    label: 'galaxy:placeDustParams',
    size: PLACE_DUST_PARAMS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const readbackByteSize = MAX_PARTICLE_COUNT * FIELD_COMPONENT_FLOATS * 4;
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:placeDustReadback',
    size: readbackByteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // massOut — see IsmMapPlaceDust.massBuffer's own doc above. One f32 per
  // particle SLOT (not byte-packed like FieldComponentRec). COPY_SRC beyond
  // the production STORAGE need, same "debug readback rides the production
  // buffer's own COPY_SRC flag" precedent `fieldComps` establishes
  // (createGalaxyFieldRenderer.ts).
  const massBuffer = device.createBuffer({
    label: 'galaxy:placeDustMass',
    size: MAX_PARTICLE_COUNT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const massReadbackBuffer = device.createBuffer({
    label: 'galaxy:placeDustMassReadback',
    size: MAX_PARTICLE_COUNT * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  function encode(enc: GPUCommandEncoder, input: PlaceDustDispatchInput): void {
    const { budget } = input;
    device.queue.writeBuffer(paramsBuffer, 0, packPlaceDustParams(toUniformInput(input)));
    const bindGroup = device.createBindGroup({
      label: 'galaxy:placeDustBG',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: input.prefixBuffer } },
        { binding: 2, resource: { buffer: input.ringMeansBuffer } },
        { binding: 3, resource: input.ismMapTexture.createView() },
        { binding: 4, resource: input.orientationTexture.createView() },
        { binding: 5, resource: { buffer: input.fieldCompsBuffer } },
        { binding: 6, resource: { buffer: massBuffer } },
      ],
    });
    const pass = enc.beginComputePass({ label: 'galaxy:placeDustPass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(budget.count / PLACE_DUST_WORKGROUP_SIZE));
    pass.end();
  }

  return {
    dispatchPlaceDust(enc, input): void {
      if (input.budget.count <= 0) return;
      encode(enc, input);
    },

    async dispatchAndReadbackDust(
      input,
    ): Promise<{ readonly records: Float32Array; readonly mass: Float32Array }> {
      const { budget } = input;
      if (budget.count <= 0) return { records: new Float32Array(0), mass: new Float32Array(0) };
      const enc = device.createCommandEncoder({ label: 'galaxy:placeDustDebugDispatch' });
      encode(enc, input);
      const byteSize = budget.count * FIELD_COMPONENT_FLOATS * 4;
      const byteOffset = input.dustOffset * FIELD_COMPONENT_FLOATS * 4;
      // copyBufferToBuffer's own offset alignment (COPY_BUFFER_ALIGNMENT = 4
      // bytes) is far looser than a storage BIND GROUP's
      // minStorageBufferOffsetAlignment (typically 256) — the bind group
      // above sidesteps that limit by binding the WHOLE fieldComps buffer
      // and indexing `dustOffset` in-shader instead; this copy has no such
      // constraint to work around.
      enc.copyBufferToBuffer(input.fieldCompsBuffer, byteOffset, readbackBuffer, 0, byteSize);
      const massByteSize = budget.count * 4;
      enc.copyBufferToBuffer(massBuffer, 0, massReadbackBuffer, 0, massByteSize);
      device.queue.submit([enc.finish()]);

      await Promise.all([
        readbackBuffer.mapAsync(GPUMapMode.READ, 0, byteSize),
        massReadbackBuffer.mapAsync(GPUMapMode.READ, 0, massByteSize),
      ]);
      try {
        return {
          records: new Float32Array(readbackBuffer.getMappedRange(0, byteSize).slice(0)),
          mass: new Float32Array(massReadbackBuffer.getMappedRange(0, massByteSize).slice(0)),
        };
      } finally {
        readbackBuffer.unmap();
        massReadbackBuffer.unmap();
      }
    },

    massBuffer,

    dispose(): void {
      paramsBuffer.destroy();
      readbackBuffer.destroy();
      massBuffer.destroy();
      massReadbackBuffer.destroy();
    },
  };
}
