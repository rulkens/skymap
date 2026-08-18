/**
 * createTracePass — the trace-grid raymarch: the sim's storage buffer straight to the
 * HDR accum target through Polyphorm's transfer function (mcpm/fragment.wesl).
 *
 * Bind groups follow io.wesl's contract so the fragment can call grid.wesl's
 * `sampleTrace` unchanged — group(0) is a `McpmUniforms`-shaped buffer, group(1) slot 2
 * the trace grid, group(2) this pass's camera and palette. The pass owns its group(0)
 * buffer rather than sharing the sim's: it reads only the three dims (both sides derive
 * them from the same `GridBox`), and the sim's bind group is COMPUTE-visibility, which a
 * render pipeline cannot accept. Layouts are explicit, never 'auto'.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { ScalarFieldPaletteId } from '../../../../src/@types/data/volume/ScalarFieldPaletteId';
import type { GridBox } from '../../@types/GridBox';
import type { GridElement } from '../../@types/GridElement';
import { worldToVoxel } from '../field/worldToVoxel';
import { cameraBasis } from './cameraBasis';
import { UNIFORM_BYTES } from '../sim/createGridBuffers';
import { specializeGridElement } from '../sim/specializeGridElement';
import { uploadPaletteLut } from './uploadPaletteLut';
import vertexWgsl from '../../../../src/services/gpu/shaders/mcpm/vertex.wesl?static';
import fragmentWgsl from '../../../../src/services/gpu/shaders/mcpm/fragment.wesl?static';

/** What the pass needs from the sim to march it. `traceBuffer` stays the harness's to destroy. */
export type TraceSource = {
  readonly traceBuffer: GPUBuffer;
  readonly box: GridBox;
  readonly element: GridElement;
  readonly paletteId: ScalarFieldPaletteId;
};

/**
 * Per-frame view. Camera fields are world Mpc (the tool's only length unit); the pass
 * converts to the voxel frame the shader marches in. The last four are Polyphorm's
 * rendering knobs — `stepVoxels = 1.0` is fork parity, see mcpm/fragment.wesl.
 */
export type TraceView = {
  readonly eyeMpc: Readonly<Vec3>;
  readonly targetMpc: Readonly<Vec3>;
  readonly upMpc: Readonly<Vec3>;
  readonly fovYRad: number;
  readonly aspect: number;
  readonly trimDensity: number;
  readonly sampleWeight: number;
  readonly opticalThickness: number;
  readonly stepVoxels: number;
  readonly maxSteps: number;
  /** Emission composite instead of the fork's 'over'; false is fork parity. */
  readonly additive: boolean;
};

export type TracePass = {
  /** Open the raymarch into `target`. CLEARS it: this is the frame's base layer. */
  draw(encoder: GPUCommandEncoder, target: GPUTextureView, view: TraceView): void;
  dispose(): void;
};

// The grid dims are members 7..9 of io.wesl's McpmUniforms (UNIFORM_BYTES sizes it).
const DIMS_INDEX = 7;
// TraceView in WGSL: four vec3+scalar rows, then maxSteps, additive, 8 bytes of padding.
const VIEW_UNIFORM_BYTES = 80;
// An unbounded step count is a GPU hang, not a slow frame.
const MAX_STEPS_CEILING = 4096;

export function createTracePass(opts: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly source: TraceSource;
}): TracePass {
  const { device, source } = opts;

  const vertexModule = opts.makeShader(vertexWgsl, 'mcpm-trace-vertex');
  const fragmentModule = opts.makeShader(
    specializeGridElement(fragmentWgsl, source.element),
    'mcpm-trace-fragment',
  );

  const simLayout = device.createBindGroupLayout({
    label: 'mcpm-trace-sim-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const gridLayout = device.createBindGroupLayout({
    label: 'mcpm-trace-grid-layout',
    entries: [{ binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'storage' } }],
  });
  const viewLayout = device.createBindGroupLayout({
    label: 'mcpm-trace-view-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'mcpm-trace',
    layout: device.createPipelineLayout({
      label: 'mcpm-trace-layout',
      bindGroupLayouts: [simLayout, gridLayout, viewLayout],
    }),
    vertex: { module: vertexModule, entryPoint: 'vs' },
    fragment: {
      module: fragmentModule,
      entryPoint: 'fs',
      targets: [{ format: opts.targetFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const simBuffer = device.createBuffer({
    label: 'mcpm-trace-sim',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const dims = new Int32Array(UNIFORM_BYTES / 4);
  dims[DIMS_INDEX] = source.box.dims[0];
  dims[DIMS_INDEX + 1] = source.box.dims[1];
  dims[DIMS_INDEX + 2] = source.box.dims[2];
  device.queue.writeBuffer(simBuffer, 0, dims);

  const viewBuffer = device.createBuffer({
    label: 'mcpm-trace-view',
    size: VIEW_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const viewBytes = new ArrayBuffer(VIEW_UNIFORM_BYTES);
  const viewF32 = new Float32Array(viewBytes);
  const viewU32 = new Uint32Array(viewBytes);

  const palette = uploadPaletteLut(device, source.paletteId);
  const paletteSampler = device.createSampler({
    label: 'mcpm-trace-palette',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const simBindGroup = device.createBindGroup({
    label: 'mcpm-trace-sim',
    layout: simLayout,
    entries: [{ binding: 0, resource: { buffer: simBuffer } }],
  });
  const gridBindGroup = device.createBindGroup({
    label: 'mcpm-trace-grid',
    layout: gridLayout,
    entries: [{ binding: 2, resource: { buffer: source.traceBuffer } }],
  });
  const viewBindGroup = device.createBindGroup({
    label: 'mcpm-trace-view',
    layout: viewLayout,
    entries: [
      { binding: 0, resource: { buffer: viewBuffer } },
      { binding: 1, resource: palette.createView() },
      { binding: 2, resource: paletteSampler },
    ],
  });

  function writeView(view: TraceView): void {
    const eye = worldToVoxel(source.box, [view.eyeMpc[0], view.eyeMpc[1], view.eyeMpc[2]]);
    // Shared with the splat and overlay passes: camera.wesl's projection is the exact
    // inverse of the ray setup below, and only holds if both read the same basis.
    const { right, up, forward } = cameraBasis(view.eyeMpc, view.targetMpc, view.upMpc);
    const tanHalfFov = Math.tan(view.fovYRad * 0.5);

    viewF32.set(eye, 0);
    viewF32[3] = view.trimDensity;
    viewF32.set(forward, 4);
    viewF32[7] = view.sampleWeight;
    viewF32[8] = right[0] * tanHalfFov * view.aspect;
    viewF32[9] = right[1] * tanHalfFov * view.aspect;
    viewF32[10] = right[2] * tanHalfFov * view.aspect;
    viewF32[11] = view.opticalThickness;
    viewF32[12] = up[0] * tanHalfFov;
    viewF32[13] = up[1] * tanHalfFov;
    viewF32[14] = up[2] * tanHalfFov;
    viewF32[15] = view.stepVoxels;
    viewU32[16] = Math.max(1, Math.min(MAX_STEPS_CEILING, Math.floor(view.maxSteps)));
    viewU32[17] = view.additive ? 1 : 0;
    device.queue.writeBuffer(viewBuffer, 0, viewBytes);
  }

  return {
    draw(encoder: GPUCommandEncoder, target: GPUTextureView, view: TraceView): void {
      writeView(view);
      const pass = encoder.beginRenderPass({
        label: 'mcpm-trace',
        colorAttachments: [
          {
            view: target,
            loadOp: 'clear',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, simBindGroup);
      pass.setBindGroup(1, gridBindGroup);
      pass.setBindGroup(2, viewBindGroup);
      pass.draw(3);
      pass.end();
    },
    dispose(): void {
      palette.destroy();
      simBuffer.destroy();
      viewBuffer.destroy();
    },
  };
}
