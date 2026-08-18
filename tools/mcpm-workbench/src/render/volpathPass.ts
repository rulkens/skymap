/**
 * createVolpathPass — Polyphorm's volumetric path tracer: one compute dispatch traces a
 * single jittered sample per pixel into a `vec4<f32>` accumulator (mcpm/volpath.wesl),
 * then a fullscreen fragment resolves the mean into the HDR target, LOADing and blending
 * one/one like every other layer (mcpm/volpathBlit.wesl).
 *
 * The image is only correct while the accumulator agrees with the camera and parameters
 * that produced it: the caller MUST `reset()` on any change to either (a viewport change
 * resets itself, the buffer being rebuilt). Layouts are explicit, never 'auto'; the trace
 * grid binds read-only here rather than through io.wesl's read_write contract.
 */
import type { TraceSource } from './tracePass';
import { specializeGridElement } from '../sim/specializeGridElement';
import { uploadPaletteLut } from './uploadPaletteLut';
import { MCPM_CAMERA_BYTES, writeMcpmCamera, type McpmCameraView } from './writeMcpmCamera';
import vertexWgsl from '../../../../src/services/gpu/shaders/mcpm/vertex.wesl?static';
import volpathWgsl from '../../../../src/services/gpu/shaders/mcpm/volpath.wesl?static';
import volpathBlitWgsl from '../../../../src/services/gpu/shaders/mcpm/volpathBlit.wesl?static';

/**
 * The tracer's knobs. The first nine are spec §7's set; `trimDensity` and `sampleWeight`
 * are the raymarch layer's own two, here because Polyphorm's trace→density transfer
 * (`traceToRho`) is defined in terms of them and the two layers must agree on it.
 */
export type VolpathParams = {
  /** Extinction. `albedo` splits it: scattering = albedo · sigmaT. */
  readonly sigmaT: number;
  readonly albedo: number;
  /** Emission scale — how bright a collision glows through the palette. */
  readonly sigmaE: number;
  /** Henyey-Greenstein g: <0 back-scatters, 0 isotropic, >0 forward. */
  readonly anisotropy: number;
  /** Density floor inside the box, so the void between filaments still scatters. */
  readonly ambientTrace: number;
  readonly bounces: number;
  /** Tracking majorant: below the field's true peak the image biases dark. */
  readonly traceMax: number;
  readonly exposure: number;
  /** Tonemap each sample before accumulating (the fork's LDR accumulation). */
  readonly compressive: boolean;
  readonly trimDensity: number;
  readonly sampleWeight: number;
};

export type VolpathPass = {
  /**
   * Accumulate one sample per pixel and resolve. Sizes its own accumulator from
   * `view.viewportPx` — there is no separate resize step to forget.
   */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    view: McpmCameraView,
    params: VolpathParams,
  ): void;
  /** Drop every accumulated sample; the clear rides the next `draw`'s encoder. */
  reset(): void;
  dispose(): void;
};

// Mirrors volpath.wesl's VOLPATH_WG: the dispatch must cover every pixel of the drawable.
const VOLPATH_WG = 8;
// VolpathParams in WGSL is 14 scalars = 56 bytes, rounded up to the struct's 16-byte
// multiple. VolpathBlit is 12, likewise rounded — uniform buffers bind at 16 minimum.
const PARAMS_BYTES = 64;
const BLIT_UNIFORM_BYTES = 16;
// Each bounce is a full tracking walk; an unbounded count is a hung device, not a slow
// frame. sigmaT and traceMax divide inside the kernel; anisotropy at ±1 divides by zero
// in the Henyey-Greenstein sample.
const MAX_BOUNCES = 64;
const MIN_SIGMA_T = 1e-4;
const MIN_TRACE_MAX = 1e-6;
const MAX_ANISOTROPY = 0.99;

export function createVolpathPass(opts: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly source: TraceSource;
}): VolpathPass {
  const { device, source } = opts;

  const traceModule = opts.makeShader(
    specializeGridElement(volpathWgsl, source.element),
    'mcpm-volpath',
  );
  const vertexModule = opts.makeShader(vertexWgsl, 'mcpm-volpath-vertex');
  const blitModule = opts.makeShader(volpathBlitWgsl, 'mcpm-volpath-blit');

  const frameLayout = device.createBindGroupLayout({
    label: 'mcpm-volpath-frame-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const sceneLayout = device.createBindGroupLayout({
    label: 'mcpm-volpath-scene-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
    ],
  });
  const blitLayout = device.createBindGroupLayout({
    label: 'mcpm-volpath-blit-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  });

  const tracePipeline = device.createComputePipeline({
    label: 'mcpm-volpath',
    layout: device.createPipelineLayout({
      label: 'mcpm-volpath-layout',
      bindGroupLayouts: [frameLayout, sceneLayout],
    }),
    compute: { module: traceModule, entryPoint: 'cs' },
  });
  const blitPipeline = device.createRenderPipeline({
    label: 'mcpm-volpath-blit',
    layout: device.createPipelineLayout({
      label: 'mcpm-volpath-blit-layout',
      bindGroupLayouts: [blitLayout],
    }),
    vertex: { module: vertexModule, entryPoint: 'vs' },
    fragment: {
      module: blitModule,
      entryPoint: 'fs',
      targets: [
        {
          format: opts.targetFormat,
          // The 4th layer of an additive stack: an omitted blend REPLACES everything
          // drawn beneath instead of adding to it, alpha lane included.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  const camBuffer = device.createBuffer({
    label: 'mcpm-volpath-camera',
    size: MCPM_CAMERA_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camF32 = new Float32Array(MCPM_CAMERA_BYTES / 4);

  const paramsBuffer = device.createBuffer({
    label: 'mcpm-volpath-params',
    size: PARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const paramsBytes = new ArrayBuffer(PARAMS_BYTES);
  const paramsI32 = new Int32Array(paramsBytes);
  const paramsF32 = new Float32Array(paramsBytes);
  const paramsU32 = new Uint32Array(paramsBytes);

  const blitBuffer = device.createBuffer({
    label: 'mcpm-volpath-blit-uniform',
    size: BLIT_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const blitBytes = new ArrayBuffer(BLIT_UNIFORM_BYTES);
  const blitU32 = new Uint32Array(blitBytes);
  const blitF32 = new Float32Array(blitBytes);

  const palette = uploadPaletteLut(device, source.paletteId);
  const paletteSampler = device.createSampler({
    label: 'mcpm-volpath-palette',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const sceneBindGroup = device.createBindGroup({
    label: 'mcpm-volpath-scene',
    layout: sceneLayout,
    entries: [
      { binding: 0, resource: { buffer: source.traceBuffer } },
      { binding: 1, resource: palette.createView() },
      { binding: 2, resource: paletteSampler },
    ],
  });

  let curWidth = 0;
  let curHeight = 0;
  let accumBuffer: GPUBuffer | null = null;
  let frameBindGroup: GPUBindGroup | null = null;
  let blitBindGroup: GPUBindGroup | null = null;
  let pendingClear = true;

  function ensureAccumulator(width: number, height: number): void {
    if (width === curWidth && height === curHeight && accumBuffer) return;
    curWidth = width;
    curHeight = height;

    accumBuffer?.destroy();
    accumBuffer = device.createBuffer({
      label: 'mcpm-volpath-accum',
      // One vec4<f32> per pixel: rgb radiance sum, .a the sample count.
      size: width * height * 16,
      // COPY_DST for reset()'s clearBuffer — samples traced under another camera are
      // worse than no samples.
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    frameBindGroup = device.createBindGroup({
      label: 'mcpm-volpath-frame',
      layout: frameLayout,
      entries: [
        { binding: 0, resource: { buffer: camBuffer } },
        { binding: 1, resource: { buffer: paramsBuffer } },
        { binding: 2, resource: { buffer: accumBuffer } },
      ],
    });
    blitBindGroup = device.createBindGroup({
      label: 'mcpm-volpath-blit',
      layout: blitLayout,
      entries: [
        { binding: 0, resource: { buffer: blitBuffer } },
        { binding: 1, resource: { buffer: accumBuffer } },
      ],
    });
    // A fresh buffer holds whatever the driver left there, and .a is read as a count.
    pendingClear = true;
  }

  function writeParams(params: VolpathParams): void {
    // volpath.wesl's VolpathParams, byte for byte:
    //   +0  i32 gridWidth   +4  i32 gridHeight  +8  i32 gridDepth  +12 f32 sigmaT
    //   +16 f32 albedo      +20 f32 sigmaE      +24 f32 anisotropy +28 f32 ambientTrace
    //   +32 f32 traceMax    +36 f32 trimDensity +40 f32 sampleWeight +44 f32 exposure
    //   +48 u32 bounces     +52 u32 compressive +56..63 padding to the 16-byte multiple
    paramsI32[0] = source.box.dims[0];
    paramsI32[1] = source.box.dims[1];
    paramsI32[2] = source.box.dims[2];
    paramsF32[3] = Math.max(MIN_SIGMA_T, params.sigmaT);
    paramsF32[4] = Math.min(1, Math.max(0, params.albedo));
    paramsF32[5] = params.sigmaE;
    paramsF32[6] = Math.min(MAX_ANISOTROPY, Math.max(-MAX_ANISOTROPY, params.anisotropy));
    paramsF32[7] = Math.max(0, params.ambientTrace);
    paramsF32[8] = Math.max(MIN_TRACE_MAX, params.traceMax);
    paramsF32[9] = params.trimDensity;
    paramsF32[10] = params.sampleWeight;
    paramsF32[11] = params.exposure;
    paramsU32[12] = Math.max(1, Math.min(MAX_BOUNCES, Math.floor(params.bounces)));
    paramsU32[13] = params.compressive ? 1 : 0;
    device.queue.writeBuffer(paramsBuffer, 0, paramsBytes);
  }

  return {
    draw(
      encoder: GPUCommandEncoder,
      target: GPUTextureView,
      view: McpmCameraView,
      params: VolpathParams,
    ): void {
      const width = Math.max(1, Math.floor(view.viewportPx[0]));
      const height = Math.max(1, Math.floor(view.viewportPx[1]));
      ensureAccumulator(width, height);
      if (!accumBuffer || !frameBindGroup || !blitBindGroup) {
        throw new Error('VolpathPass.draw: the accumulator was not created');
      }

      // Floored to the same integers the accumulator is sized and indexed by: the kernel
      // takes its row stride from the camera's screenWidth, and a fractional drawable
      // would leave that disagreeing with this buffer, which shears the image.
      writeMcpmCamera(camF32, source.box, { ...view, viewportPx: [width, height] });
      device.queue.writeBuffer(camBuffer, 0, camF32);
      writeParams(params);
      // VolpathBlit: +0 u32 screenWidth, +4 f32 exposure, +8 u32 compressive, +12 pad.
      blitU32[0] = width;
      blitF32[1] = params.exposure;
      blitU32[2] = params.compressive ? 1 : 0;
      device.queue.writeBuffer(blitBuffer, 0, blitBytes);

      if (pendingClear) {
        encoder.clearBuffer(accumBuffer);
        pendingClear = false;
      }

      const trace = encoder.beginComputePass({ label: 'mcpm-volpath' });
      trace.setPipeline(tracePipeline);
      trace.setBindGroup(0, frameBindGroup);
      trace.setBindGroup(1, sceneBindGroup);
      trace.dispatchWorkgroups(Math.ceil(width / VOLPATH_WG), Math.ceil(height / VOLPATH_WG));
      trace.end();

      const blit = encoder.beginRenderPass({
        label: 'mcpm-volpath-blit',
        colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
      });
      blit.setPipeline(blitPipeline);
      blit.setBindGroup(0, blitBindGroup);
      blit.draw(3);
      blit.end();
    },
    reset(): void {
      pendingClear = true;
    },
    dispose(): void {
      accumBuffer?.destroy();
      accumBuffer = null;
      palette.destroy();
      camBuffer.destroy();
      paramsBuffer.destroy();
      blitBuffer.destroy();
    },
  };
}
