/**
 * createSfMapOrientation — the GPU structure-tensor chain over the active
 * SF-map generator's packed map (automaton or fluid, whichever
 * `sfMap.generator` names — this module only ever sees `sourceTexture`, never
 * which generator wrote it): field blur (separable) -> tensor -> tensor blur
 * (separable) -> coherence, plus the overlay that presents it.
 *
 * Entirely GPU-side: no readback to run FROM, no JS blur, no upload back. The
 * source is a texture WebGPU zero-initialises, so `dispatch` is safe to call
 * before either generator has ever run.
 *
 * The perf GATE (is any consumer live?) stays with the caller — it reads the
 * render bag and the field tuning, neither of which this module should know
 * about. What lives here is every resource and the pass order.
 */
import { ADDITIVE_BLEND } from '../../../../../src/services/gpu/lib/blendStates';
import {
  SF_MAP_AZ,
  SF_MAP_RINGS,
  SF_MAP_WORKGROUP_SIZE,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { alignedBytesPerRow } from '../../../../../src/utils/gpu/alignedBytesPerRow';

import orientationPresentWgsl from '../shaders/milkyWay/sfMap/orientationPresent.wesl?static';
import sfMapOrientationFieldWgsl from '../shaders/milkyWay/sfMap/sfMapOrientationField.wesl?static';
import sfMapOrientationTensorWgsl from '../shaders/milkyWay/sfMap/sfMapOrientationTensor.wesl?static';
import sfMapOrientationTensorBlurWgsl from '../shaders/milkyWay/sfMap/sfMapOrientationTensorBlur.wesl?static';
import sfMapOrientationCoherenceWgsl from '../shaders/milkyWay/sfMap/sfMapOrientationCoherence.wesl?static';

export type SfMapOrientation = {
  readonly texture: GPUTexture;
  readonly readbackBuffer: GPUBuffer;
  readonly readbackBytesPerRow: number;
  readonly presentPipeline: GPURenderPipeline;
  readonly presentBindGroup: GPUBindGroup;
  /** Run the six passes over the current source texture. The caller gates this; it does not gate itself. */
  dispatch(input: {
    readonly grid: GalaxySfMapGridRadius;
    readonly sigmaDerivTexels: number;
    readonly sigmaIntegTexels: number;
    /** `sfMapOrientationField.wesl`'s pedestal-subtraction inputs — see `SfMapOrientationPedestal` there. `gasFloor: 1` collapses `gasProfile` to a flat pedestal (the automaton's own case); `gasScaleLength` is then unused algebraically but must stay finite (the shader still evaluates `exp(-r/gasScaleLength)` before the zero multiply). */
    readonly gasFloor: number;
    readonly gasScaleLength: number;
    /** The ambient dust pedestal both generators seed at step 0 — `SF_MAP_AMBIENT_DUST` (`sweptDustOvershoot.ts`), passed live rather than baked in so the shader carries no restated constant. */
    readonly ambient: number;
  }): void;
  dispose(): void;
};

export function createSfMapOrientation(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly hdrFormat: GPUTextureFormat;
    /** io.wesl's per-frame camera uniform — the present bind group's binding 0. */
    readonly fieldUbo: GPUBuffer;
    /** The active generator's packed output; this chain's input. */
    readonly sourceTexture: GPUTexture;
  },
): SfMapOrientation {
  const { makeShader } = deps;

  const presentMod = makeShader(orientationPresentWgsl, 'galaxy:orientationPresent');
  const presentPipe = device.createRenderPipeline({
    label: 'galaxy:orientationPresentPipe',
    layout: 'auto',
    vertex: { module: presentMod, entryPoint: 'vs' },
    // Additive into sceneTex, same reasoning as the sfMap present pass: this
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
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  // rgba16float = 4 lanes * 2 bytes; only .xy are read back, .zw are copied
  // along for free since a texture copy can't pick channels.
  const readbackBytesPerRow = alignedBytesPerRow(SF_MAP_AZ * 8);
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:orientationReadbackBuf',
    size: readbackBytesPerRow * SF_MAP_RINGS,
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
    label: 'galaxy:sfMapOrientationSigmaUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // gasFloor/gasScaleLength/rMin/rMax/ambient — sfMapOrientationField.wesl's
  // own pedestal-subtraction uniform (its `SfMapOrientationPedestal`), bound
  // only into the field-blur-AZIMUTH bind group below: that is the one
  // dispatch that reads raw dust off `sourceTexture`, so it is the one that
  // needs to know the pedestal it must subtract before the gradient stage.
  // 5 floats = 20 bytes, rounded up to this module's own 16-byte-block
  // convention (see sigmaUbo/gridUbo above).
  const pedestalUbo = device.createBuffer({
    label: 'galaxy:sfMapOrientationPedestalUbo',
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

  // Every intermediate is SF_MAP_AZ x SF_MAP_RINGS, allocated once and given
  // BOTH TEXTURE_BINDING (the next pass reads it) and STORAGE_BINDING (this
  // pass writes it). r32float for the single-channel field stage, rgba16float
  // for the packed-tensor stage — both core-guaranteed write-access formats.
  const makeScratch = (label: string, format: GPUTextureFormat): GPUTexture =>
    device.createTexture({
      label,
      size: [SF_MAP_AZ, SF_MAP_RINGS],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
  const fieldBlurTex = makeScratch('galaxy:orientationFieldBlurTex', 'r32float');
  const fieldSmoothTex = makeScratch('galaxy:orientationFieldSmoothTex', 'r32float');
  const tensorRawTex = makeScratch('galaxy:orientationTensorRawTex', 'rgba16float');
  const tensorBlurTex = makeScratch('galaxy:orientationTensorBlurTex', 'rgba16float');
  const tensorFinalTex = makeScratch('galaxy:orientationTensorFinalTex', 'rgba16float');

  const fieldMod = makeShader(sfMapOrientationFieldWgsl, 'galaxy:sfMapOrientationField');
  const tensorMod = makeShader(sfMapOrientationTensorWgsl, 'galaxy:sfMapOrientationTensor');
  const tensorBlurMod = makeShader(
    sfMapOrientationTensorBlurWgsl,
    'galaxy:sfMapOrientationTensorBlur',
  );
  const coherenceMod = makeShader(
    sfMapOrientationCoherenceWgsl,
    'galaxy:sfMapOrientationCoherence',
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
      'galaxy:sfMapOrientationFieldBlurAzimuthPipe',
      fieldMod,
      'csBlurAzimuth',
    );
    const fieldBlurRing = makeComputePipe(
      'galaxy:sfMapOrientationFieldBlurRingPipe',
      fieldMod,
      'csBlurRing',
    );
    const tensor = makeComputePipe('galaxy:sfMapOrientationTensorPipe', tensorMod, 'cs');
    const tensorBlurAzimuth = makeComputePipe(
      'galaxy:sfMapOrientationTensorBlurAzimuthPipe',
      tensorBlurMod,
      'csBlurAzimuth',
    );
    const tensorBlurRing = makeComputePipe(
      'galaxy:sfMapOrientationTensorBlurRingPipe',
      tensorBlurMod,
      'csBlurRing',
    );
    const coherence = makeComputePipe('galaxy:sfMapOrientationCoherencePipe', coherenceMod, 'cs');
    return [
      {
        pipeline: fieldBlurAzimuth,
        bindGroup: makeStageBindGroup(
          'galaxy:sfMapOrientationFieldBlurAzimuthBG',
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
          'galaxy:sfMapOrientationFieldBlurRingBG',
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
          'galaxy:sfMapOrientationTensorBG',
          tensor,
          fieldSmoothTex,
          tensorRawTex,
          gridUbo,
        ),
      },
      {
        pipeline: tensorBlurAzimuth,
        bindGroup: makeStageBindGroup(
          'galaxy:sfMapOrientationTensorBlurAzimuthBG',
          tensorBlurAzimuth,
          tensorRawTex,
          tensorBlurTex,
          sigmaUbo,
        ),
      },
      {
        pipeline: tensorBlurRing,
        bindGroup: makeStageBindGroup(
          'galaxy:sfMapOrientationTensorBlurRingBG',
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
          label: 'galaxy:sfMapOrientationCoherenceBG',
          layout: coherence.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: tensorFinalTex.createView() },
            { binding: 1, resource: texture.createView() },
          ],
        }),
      },
    ];
  })();

  const dispatchX = SF_MAP_AZ / SF_MAP_WORKGROUP_SIZE;
  const dispatchY = SF_MAP_RINGS / SF_MAP_WORKGROUP_SIZE;

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
      const enc = device.createCommandEncoder({ label: 'galaxy:sfMapOrientation' });
      // All six dispatches share ONE compute pass: WebGPU orders
      // dispatchWorkgroups calls within a single pass, so no extra pass boundary
      // is needed between stages just because the texture object changed.
      const pass = enc.beginComputePass({ label: 'galaxy:sfMapOrientationPass' });
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
