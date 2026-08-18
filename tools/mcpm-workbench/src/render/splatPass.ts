/**
 * createSplatPass — Polyphorm's particle view: a compute dispatch splats every FREE AGENT
 * into an atomic u32 screen buffer (mcpm/splatTransform.wesl), then a fullscreen fragment
 * tonemaps that buffer into the HDR accum target (mcpm/splatBlit.wesl). The catalog prefix
 * of the lanes is skipped here — those rows are the Galaxies layer's to draw.
 *
 * Bind groups follow io.wesl's contract so the kernel reads the agent lanes unchanged —
 * group(0) a `McpmUniforms`-shaped buffer for the counts, group(1) slots 3..5, and
 * group(2) this pass's own camera plus the accumulation buffer. Layouts are explicit,
 * never 'auto'. The pass owns its group(0) buffer rather than sharing the sim's, for the
 * same two reasons tracePass does: it reads only counts, and the sim's is COMPUTE-only.
 */
import type { AgentBuffers } from '../../@types/AgentBuffers';
import type { GridBox } from '../../@types/GridBox';
import { UNIFORM_BYTES } from '../sim/createGridBuffers';
import { MCPM_CAMERA_BYTES, writeMcpmCamera, type McpmCameraView } from './writeMcpmCamera';
import vertexWgsl from '../../../../src/services/gpu/shaders/mcpm/vertex.wesl?static';
import transformWgsl from '../../../../src/services/gpu/shaders/mcpm/splatTransform.wesl?static';
import blitWgsl from '../../../../src/services/gpu/shaders/mcpm/splatBlit.wesl?static';

/** `sampleWeight` is the raymarch's own knob: the fork feeds both views the same one. */
export type SplatView = McpmCameraView & {
  readonly sampleWeight: number;
};

export type SplatPass = {
  /** Follow the drawable size; the accumulation buffer is one u32 per pixel. */
  resize(width: number, height: number): void;
  /** Splat then blit into `target`. LOADS and adds: the graph clears the frame, not this. */
  draw(encoder: GPUCommandEncoder, target: GPUTextureView, view: SplatView): void;
  dispose(): void;
};

// The counts are members 12..13 of io.wesl's McpmUniforms (UNIFORM_BYTES sizes it).
const N_DATA_POINTS_INDEX = 12;
// splatTransform.wesl's SPLAT_WG_SIZE — mirrored, so the dispatch covers every particle.
const SPLAT_WG_SIZE = 256;
// SplatBlit is 8 bytes of payload; uniform buffers bind at a 16-byte minimum.
const BLIT_UNIFORM_BYTES = 16;

export function createSplatPass(opts: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly agents: AgentBuffers;
  readonly box: GridBox;
}): SplatPass {
  const { device, agents } = opts;

  const transformModule = opts.makeShader(transformWgsl, 'mcpm-splat-transform');
  const vertexModule = opts.makeShader(vertexWgsl, 'mcpm-splat-vertex');
  const blitModule = opts.makeShader(blitWgsl, 'mcpm-splat-blit');

  const simLayout = device.createBindGroupLayout({
    label: 'mcpm-splat-sim-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }],
  });
  const agentLayout = device.createBindGroupLayout({
    label: 'mcpm-splat-agent-layout',
    entries: [3, 4, 5].map((binding) => ({
      binding,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'storage' as const },
    })),
  });
  const transformLayout = device.createBindGroupLayout({
    label: 'mcpm-splat-transform-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const blitLayout = device.createBindGroupLayout({
    label: 'mcpm-splat-blit-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  });

  const transformPipeline = device.createComputePipeline({
    label: 'mcpm-splat-transform',
    layout: device.createPipelineLayout({
      label: 'mcpm-splat-transform-layout',
      bindGroupLayouts: [simLayout, agentLayout, transformLayout],
    }),
    compute: { module: transformModule, entryPoint: 'cs' },
  });
  const blitPipeline = device.createRenderPipeline({
    label: 'mcpm-splat-blit',
    layout: device.createPipelineLayout({
      label: 'mcpm-splat-blit-layout',
      bindGroupLayouts: [blitLayout],
    }),
    vertex: { module: vertexModule, entryPoint: 'vs' },
    fragment: {
      module: blitModule,
      entryPoint: 'fs',
      targets: [
        {
          format: opts.targetFormat,
          // One/one premultiplied, like every other layer: the graph owns the clear.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  const simBuffer = device.createBuffer({
    label: 'mcpm-splat-sim',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const counts = new Int32Array(UNIFORM_BYTES / 4);
  counts[N_DATA_POINTS_INDEX] = agents.nDataPoints;
  counts[N_DATA_POINTS_INDEX + 1] = agents.count - agents.nDataPoints;
  device.queue.writeBuffer(simBuffer, 0, counts);

  const camBuffer = device.createBuffer({
    label: 'mcpm-splat-camera',
    size: MCPM_CAMERA_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camF32 = new Float32Array(MCPM_CAMERA_BYTES / 4);

  const blitUniform = device.createBuffer({
    label: 'mcpm-splat-blit-uniform',
    size: BLIT_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const blitBytes = new ArrayBuffer(BLIT_UNIFORM_BYTES);
  const blitU32 = new Uint32Array(blitBytes);
  const blitF32 = new Float32Array(blitBytes);

  const simBindGroup = device.createBindGroup({
    label: 'mcpm-splat-sim',
    layout: simLayout,
    entries: [{ binding: 0, resource: { buffer: simBuffer } }],
  });
  const agentBindGroup = device.createBindGroup({
    label: 'mcpm-splat-agents',
    layout: agentLayout,
    entries: [
      { binding: 3, resource: { buffer: agents.x } },
      { binding: 4, resource: { buffer: agents.y } },
      { binding: 5, resource: { buffer: agents.z } },
    ],
  });

  let curWidth = 0;
  let curHeight = 0;
  let accumBuffer: GPUBuffer | null = null;
  let transformBindGroup: GPUBindGroup | null = null;
  let blitBindGroup: GPUBindGroup | null = null;

  function resize(width: number, height: number): void {
    if (width === curWidth && height === curHeight && accumBuffer) return;
    curWidth = width;
    curHeight = height;

    accumBuffer?.destroy();
    accumBuffer = device.createBuffer({
      label: 'mcpm-splat-accum',
      size: width * height * 4,
      // COPY_DST for the per-frame clearBuffer: a stale frame's counts would accumulate.
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    transformBindGroup = device.createBindGroup({
      label: 'mcpm-splat-transform',
      layout: transformLayout,
      entries: [
        { binding: 0, resource: { buffer: camBuffer } },
        { binding: 1, resource: { buffer: accumBuffer } },
      ],
    });
    blitBindGroup = device.createBindGroup({
      label: 'mcpm-splat-blit',
      layout: blitLayout,
      entries: [
        { binding: 0, resource: { buffer: blitUniform } },
        { binding: 1, resource: { buffer: accumBuffer } },
      ],
    });
  }

  return {
    resize,
    draw(encoder: GPUCommandEncoder, target: GPUTextureView, view: SplatView): void {
      if (!accumBuffer || !transformBindGroup || !blitBindGroup) {
        throw new Error('SplatPass.draw: call resize() before splatting');
      }
      writeMcpmCamera(camF32, opts.box, view);
      device.queue.writeBuffer(camBuffer, 0, camF32);
      blitU32[0] = curWidth;
      blitF32[1] = view.sampleWeight;
      device.queue.writeBuffer(blitUniform, 0, blitBytes);

      encoder.clearBuffer(accumBuffer);
      const splat = encoder.beginComputePass({ label: 'mcpm-splat-transform' });
      splat.setPipeline(transformPipeline);
      splat.setBindGroup(0, simBindGroup);
      splat.setBindGroup(1, agentBindGroup);
      splat.setBindGroup(2, transformBindGroup);
      // Free agents only — the kernel adds nDataPoints to its invocation index, so the
      // dispatch must cover the SUFFIX of the lanes, not all of them.
      splat.dispatchWorkgroups(Math.ceil((agents.count - agents.nDataPoints) / SPLAT_WG_SIZE));
      splat.end();

      const blit = encoder.beginRenderPass({
        label: 'mcpm-splat-blit',
        colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
      });
      blit.setPipeline(blitPipeline);
      blit.setBindGroup(0, blitBindGroup);
      blit.draw(3);
      blit.end();
    },
    dispose(): void {
      accumBuffer?.destroy();
      accumBuffer = null;
      simBuffer.destroy();
      camBuffer.destroy();
      blitUniform.destroy();
    },
  };
}
