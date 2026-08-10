/**
 * createIsmMapOrientation — the GPU structure-tensor chain over the ISM-map
 * generator's packed map (this module only ever sees `sourceTexture`, never
 * whether the generator that wrote it is even running): field blur
 * (separable) -> tensor -> tensor blur (separable) -> coherence, plus the
 * overlay that presents it.
 *
 * Entirely GPU-side: no readback to run FROM, no JS blur, no upload back. The
 * source is a texture WebGPU zero-initialises, so `dispatch` is safe to call
 * before the generator has ever run.
 *
 * The perf GATE (is any consumer live?) stays with the caller — it reads the
 * render bag and the field tuning, neither of which this module should know
 * about. What lives here is every resource and the pass order.
 */
import { ADDITIVE_BLEND } from '../../../../../src/services/gpu/lib/blendStates';
import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
  ISM_MAP_WORKGROUP_SIZE,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { alignedBytesPerRow } from '../../../../../src/utils/gpu/alignedBytesPerRow';

import orientationPresentWgsl from '../shaders/milkyWay/ismMap/orientationPresent.wesl?static';
import ismMapOrientationFieldWgsl from '../shaders/milkyWay/ismMap/ismMapOrientationField.wesl?static';
import ismMapOrientationTensorWgsl from '../shaders/milkyWay/ismMap/ismMapOrientationTensor.wesl?static';
import ismMapOrientationTensorBlurWgsl from '../shaders/milkyWay/ismMap/ismMapOrientationTensorBlur.wesl?static';
import ismMapOrientationCoherenceWgsl from '../shaders/milkyWay/ismMap/ismMapOrientationCoherence.wesl?static';

export type IsmMapOrientation = {
  readonly texture: GPUTexture;
  readonly readbackBuffer: GPUBuffer;
  readonly readbackBytesPerRow: number;
  readonly presentPipeline: GPURenderPipeline;
  readonly presentBindGroup: GPUBindGroup;
  /** Run the six passes over the current source texture. The caller gates this; it does not gate itself. */
  dispatch(input: {
    readonly grid: GalaxyIsmMapGridRadius;
    readonly sigmaDerivTexels: number;
    readonly sigmaIntegTexels: number;
    /** `ismMapOrientationField.wesl`'s pedestal-subtraction inputs — see `IsmMapOrientationPedestal` there. `gasFloor: 1` collapses `gasProfile` to a flat pedestal (the blank-map case, generator off); `gasScaleLength` is then unused algebraically but must stay finite (the shader still evaluates `exp(-r/gasScaleLength)` before the zero multiply). */
    readonly gasFloor: number;
    readonly gasScaleLength: number;
    /** The ambient dust pedestal the generator seeds at step 0 — `ISM_MAP_AMBIENT_DUST` (`ismMapAmbientDust.ts`), passed live rather than baked in so the shader carries no restated constant. */
    readonly ambient: number;
  }): void;
  dispose(): void;
};

export function createIsmMapOrientation(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly hdrFormat: GPUTextureFormat;
    /** io.wesl's per-frame camera uniform — the present bind group's binding 0. */
    readonly fieldUbo: GPUBuffer;
    /** The active generator's packed output; this chain's input. */
    readonly sourceTexture: GPUTexture;
  },
): IsmMapOrientation {
  const { makeShader } = deps;

  const presentMod = makeShader(orientationPresentWgsl, 'galaxy:orientationPresent');
  const presentPipe = device.createRenderPipeline({
    label: 'galaxy:orientationPresentPipe',
    layout: 'auto',
    vertex: { module: presentMod, entryPoint: 'vs' },
    // Additive into sceneTex, same reasoning as the ismMap present pass: this
    // draw must sum with whatever background extras' sprites already put there.
    fragment: {
      module: presentMod,
      entryPoint: 'fs',
      targets: [{ format: deps.hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  // Bilinear sampling is safe here BECAUSE the two channels are the packed
  // (cos2theta, sin2theta) double-angle vector, not a bare angle — only that
  // representation interpolates across the pi wrap without a false
  // zero-crossing (a filament has no head/tail).
  const sampler = device.createSampler({
    label: 'galaxy:orientationSampler',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear',
  });
  // rgba16float, not rg16float: WebGPU core only guarantees WRITE-access
  // storage textures for r32/rgba8/rgba16/rgba32 formats, not 2-component ones,
  // and the coherence pass writes this directly. .zw sit unused; the present
  // shader reads only .xy either way.
  const texture = device.createTexture({
    label: 'galaxy:orientationTex',
    size: [ISM_MAP_AZ, ISM_MAP_RINGS],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  // rgba16float = 4 lanes * 2 bytes; only .xy are read back, .zw are copied
  // along for free since a texture copy can't pick channels.
  const readbackBytesPerRow = alignedBytesPerRow(ISM_MAP_AZ * 8);
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:orientationReadbackBuf',
    size: readbackBytesPerRow * ISM_MAP_RINGS,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // rMin/rMax only. Doubles as the tensor pass's grid uniform (its aspect
  // weight needs the same rMin/rMax the present shader's ray-mapping does) —
  // one buffer bound into two pipelines' bind groups, not two to keep in sync.
  const gridUbo = device.createBuffer({
    label: 'galaxy:orientationGridUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // sigmaDeriv/sigmaInteg only — the chain wants two, not one: a small
  // derivative scale suppresses noise before the gradient, a larger integration
  // scale (2-3x it, conventionally) averages orientations after the tensor.
  const sigmaUbo = device.createBuffer({
    label: 'galaxy:ismMapOrientationSigmaUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // gasFloor/gasScaleLength/rMin/rMax/ambient — ismMapOrientationField.wesl's
  // own pedestal-subtraction uniform (its `IsmMapOrientationPedestal`), bound
  // only into the field-blur-AZIMUTH bind group below: that is the one
  // dispatch that reads raw dust off `sourceTexture`, so it is the one that
  // needs to know the pedestal it must subtract before the gradient stage.
  // 5 floats = 20 bytes, rounded up to this module's own 16-byte-block
  // convention (see sigmaUbo/gridUbo above).
  const pedestalUbo = device.createBuffer({
    label: 'galaxy:ismMapOrientationPedestalUbo',
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const presentBindGroup = device.createBindGroup({
    label: 'galaxy:orientationPresentBG',
    layout: presentPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: deps.fieldUbo } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler },
      { binding: 3, resource: { buffer: gridUbo } },
    ],
  });

  // Every intermediate is ISM_MAP_AZ x ISM_MAP_RINGS, allocated once and given
  // BOTH TEXTURE_BINDING (the next pass reads it) and STORAGE_BINDING (this
  // pass writes it). r32float for the single-channel field stage, rgba16float
  // for the packed-tensor stage — both core-guaranteed write-access formats.
  const makeScratch = (label: string, format: GPUTextureFormat): GPUTexture =>
    device.createTexture({
      label,
      size: [ISM_MAP_AZ, ISM_MAP_RINGS],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
  const fieldBlurTex = makeScratch('galaxy:orientationFieldBlurTex', 'r32float');
  const fieldSmoothTex = makeScratch('galaxy:orientationFieldSmoothTex', 'r32float');
  const tensorRawTex = makeScratch('galaxy:orientationTensorRawTex', 'rgba16float');
  const tensorBlurTex = makeScratch('galaxy:orientationTensorBlurTex', 'rgba16float');
  const tensorFinalTex = makeScratch('galaxy:orientationTensorFinalTex', 'rgba16float');

  const fieldMod = makeShader(ismMapOrientationFieldWgsl, 'galaxy:ismMapOrientationField');
  const tensorMod = makeShader(ismMapOrientationTensorWgsl, 'galaxy:ismMapOrientationTensor');
  const tensorBlurMod = makeShader(
    ismMapOrientationTensorBlurWgsl,
    'galaxy:ismMapOrientationTensorBlur',
  );
  const coherenceMod = makeShader(
    ismMapOrientationCoherenceWgsl,
    'galaxy:ismMapOrientationCoherence',
  );
  const makeComputePipe = (
    label: string,
    module: GPUShaderModule,
    entryPoint: string,
  ): GPUComputePipeline =>
    device.createComputePipeline({ label, layout: 'auto', compute: { module, entryPoint } });

  // One bind group per pipeline ('auto' layouts never cross pipelines, even
  // where the bindings are structurally identical) — built once, since every
  // resource here is allocated for this module's whole lifetime. `extra` is
  // the field-blur-azimuth pipeline's own binding 3 (pedestalUbo); every
  // other stage's 'auto' layout is derived from an entry point that never
  // touches binding 3, so passing it there would be a validation error, not
  // a no-op — omit it for those callers.
  const makeStageBindGroup = (
    label: string,
    pipeline: GPUComputePipeline,
    src: GPUTexture,
    dst: GPUTexture,
    uniform: GPUBuffer,
    extra?: GPUBuffer,
  ): GPUBindGroup =>
    device.createBindGroup({
      label,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: src.createView() },
        { binding: 1, resource: dst.createView() },
        { binding: 2, resource: { buffer: uniform } },
        ...(extra ? [{ binding: 3, resource: { buffer: extra } }] : []),
      ],
    });

  // Ordered exactly as they dispatch; each stage reads the previous stage's write.
  const stages: readonly { pipeline: GPUComputePipeline; bindGroup: GPUBindGroup }[] = (() => {
    const fieldBlurAzimuth = makeComputePipe(
      'galaxy:ismMapOrientationFieldBlurAzimuthPipe',
      fieldMod,
      'csBlurAzimuth',
    );
    const fieldBlurRing = makeComputePipe(
      'galaxy:ismMapOrientationFieldBlurRingPipe',
      fieldMod,
      'csBlurRing',
    );
    const tensor = makeComputePipe('galaxy:ismMapOrientationTensorPipe', tensorMod, 'cs');
    const tensorBlurAzimuth = makeComputePipe(
      'galaxy:ismMapOrientationTensorBlurAzimuthPipe',
      tensorBlurMod,
      'csBlurAzimuth',
    );
    const tensorBlurRing = makeComputePipe(
      'galaxy:ismMapOrientationTensorBlurRingPipe',
      tensorBlurMod,
      'csBlurRing',
    );
    const coherence = makeComputePipe('galaxy:ismMapOrientationCoherencePipe', coherenceMod, 'cs');
    return [
      {
        pipeline: fieldBlurAzimuth,
        bindGroup: makeStageBindGroup(
          'galaxy:ismMapOrientationFieldBlurAzimuthBG',
          fieldBlurAzimuth,
          deps.sourceTexture,
          fieldBlurTex,
          sigmaUbo,
          pedestalUbo,
        ),
      },
      {
        pipeline: fieldBlurRing,
        bindGroup: makeStageBindGroup(
          'galaxy:ismMapOrientationFieldBlurRingBG',
          fieldBlurRing,
          fieldBlurTex,
          fieldSmoothTex,
          sigmaUbo,
        ),
      },
      {
        // The tensor stage takes the GRID uniform, not the sigma one.
        pipeline: tensor,
        bindGroup: makeStageBindGroup(
          'galaxy:ismMapOrientationTensorBG',
          tensor,
          fieldSmoothTex,
          tensorRawTex,
          gridUbo,
        ),
      },
      {
        pipeline: tensorBlurAzimuth,
        bindGroup: makeStageBindGroup(
          'galaxy:ismMapOrientationTensorBlurAzimuthBG',
          tensorBlurAzimuth,
          tensorRawTex,
          tensorBlurTex,
          sigmaUbo,
        ),
      },
      {
        pipeline: tensorBlurRing,
        bindGroup: makeStageBindGroup(
          'galaxy:ismMapOrientationTensorBlurRingBG',
          tensorBlurRing,
          tensorBlurTex,
          tensorFinalTex,
          sigmaUbo,
        ),
      },
      {
        // The coherence stage takes no uniform — src and dst only.
        pipeline: coherence,
        bindGroup: device.createBindGroup({
          label: 'galaxy:ismMapOrientationCoherenceBG',
          layout: coherence.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: tensorFinalTex.createView() },
            { binding: 1, resource: texture.createView() },
          ],
        }),
      },
    ];
  })();

  const dispatchX = ISM_MAP_AZ / ISM_MAP_WORKGROUP_SIZE;
  const dispatchY = ISM_MAP_RINGS / ISM_MAP_WORKGROUP_SIZE;

  return {
    texture,
    readbackBuffer,
    readbackBytesPerRow,
    presentPipeline: presentPipe,
    presentBindGroup,

    dispatch({
      grid,
      sigmaDerivTexels,
      sigmaIntegTexels,
      gasFloor,
      gasScaleLength,
      ambient,
    }): void {
      device.queue.writeBuffer(gridUbo, 0, new Float32Array([grid.rMin, grid.rMax, 0, 0]));
      device.queue.writeBuffer(
        sigmaUbo,
        0,
        new Float32Array([sigmaDerivTexels, sigmaIntegTexels, 0, 0]),
      );
      device.queue.writeBuffer(
        pedestalUbo,
        0,
        new Float32Array([gasFloor, gasScaleLength, grid.rMin, grid.rMax, ambient, 0, 0, 0]),
      );
      const enc = device.createCommandEncoder({ label: 'galaxy:ismMapOrientation' });
      // All six dispatches share ONE compute pass: WebGPU orders
      // dispatchWorkgroups calls within a single pass, so no extra pass boundary
      // is needed between stages just because the texture object changed.
      const pass = enc.beginComputePass({ label: 'galaxy:ismMapOrientationPass' });
      for (const stage of stages) {
        pass.setPipeline(stage.pipeline);
        pass.setBindGroup(0, stage.bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
      }
      pass.end();
      device.queue.submit([enc.finish()]);
    },

    dispose(): void {
      texture.destroy();
      readbackBuffer.destroy();
      gridUbo.destroy();
      sigmaUbo.destroy();
      pedestalUbo.destroy();
      fieldBlurTex.destroy();
      fieldSmoothTex.destroy();
      tensorRawTex.destroy();
      tensorBlurTex.destroy();
      tensorFinalTex.destroy();
    },
  };
}
