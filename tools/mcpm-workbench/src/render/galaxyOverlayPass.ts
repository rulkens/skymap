/**
 * createGalaxyOverlayPass — the catalog points as additive dots, the Galaxies layer
 * (mcpm/galaxyPoints.wesl): six vertices per instance, positions vertex-pulled from the
 * first `nDataPoints` entries of the agent lanes.
 *
 * The lanes are bound read-only here, NOT through io.wesl's group(1) contract: a vertex
 * stage cannot bind read_write storage, so this pass declares its own. What keeps the dots
 * on the trace they annotate is the shared McpmCamera, not a shared binding.
 */
import type { AgentBuffers } from '../../@types/AgentBuffers';
import type { GridBox } from '../../@types/GridBox';
import { MCPM_CAMERA_BYTES, writeMcpmCamera, type McpmCameraView } from './writeMcpmCamera';
import pointsWgsl from '../../../../src/services/gpu/shaders/mcpm/galaxyPoints.wesl?static';

/** The layer's two live knobs; `pointSizePx` is galaxyPoints.wesl's screen-space `radiusPx`. */
export type GalaxyOverlayOptions = {
  readonly intensity: number;
  readonly pointSizePx: number;
};

export type GalaxyOverlayPass = {
  /** Draw the points into `target`. LOADS and adds onto whatever layers came before. */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    view: McpmCameraView,
    options: GalaxyOverlayOptions,
  ): void;
  dispose(): void;
};

const VERTICES_PER_POINT = 6; // galaxyPoints.wesl's two-triangle quad

export function createGalaxyOverlayPass(opts: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly blend: GPUBlendState;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly agents: AgentBuffers;
  readonly box: GridBox;
}): GalaxyOverlayPass {
  const { device, agents } = opts;

  const module = opts.makeShader(pointsWgsl, 'mcpm-galaxy-points');

  const camLayout = device.createBindGroupLayout({
    label: 'mcpm-galaxy-camera-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const pointLayout = device.createBindGroupLayout({
    label: 'mcpm-galaxy-points-layout',
    entries: [
      ...[0, 1, 2, 3].map((binding) => ({
        binding,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage' as const },
      })),
      { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' as const } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'mcpm-galaxy-points',
    layout: device.createPipelineLayout({
      label: 'mcpm-galaxy-points-layout',
      bindGroupLayouts: [camLayout, pointLayout],
    }),
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [
        {
          format: opts.targetFormat,
          // RenderGraph's LAYER_BLEND: dots pile onto the trace rather than punching
          // through it, and the overlay never darkens what it sits over.
          blend: opts.blend,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  const camBuffer = device.createBuffer({
    label: 'mcpm-galaxy-camera',
    size: MCPM_CAMERA_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camF32 = new Float32Array(MCPM_CAMERA_BYTES / 4);

  const camBindGroup = device.createBindGroup({
    label: 'mcpm-galaxy-camera',
    layout: camLayout,
    entries: [{ binding: 0, resource: { buffer: camBuffer } }],
  });

  // OverlayParams: [weightScale, intensity, radiusPx] + pad to the 16-byte minimum.
  // weightScale un-does deriveAgentWeights' mean of 1e6/n, so the shader sees mean 1
  // whatever the catalog size; it only changes with a harness rebuild, which recreates
  // this pass, so only the two live knobs are rewritten per draw.
  const overlayParams = device.createBuffer({
    label: 'mcpm-galaxy-overlay-params',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const overlayF32 = new Float32Array([agents.nDataPoints / 1e6, 0, 0, 0]);

  const pointBindGroup = device.createBindGroup({
    label: 'mcpm-galaxy-points',
    layout: pointLayout,
    entries: [
      { binding: 0, resource: { buffer: agents.x } },
      { binding: 1, resource: { buffer: agents.y } },
      { binding: 2, resource: { buffer: agents.z } },
      { binding: 3, resource: { buffer: agents.weight } },
      { binding: 4, resource: { buffer: overlayParams } },
    ],
  });

  return {
    draw(
      encoder: GPUCommandEncoder,
      target: GPUTextureView,
      view: McpmCameraView,
      options: GalaxyOverlayOptions,
    ): void {
      writeMcpmCamera(camF32, opts.box, view);
      device.queue.writeBuffer(camBuffer, 0, camF32);
      overlayF32[1] = options.intensity;
      overlayF32[2] = options.pointSizePx;
      device.queue.writeBuffer(overlayParams, 0, overlayF32);

      const pass = encoder.beginRenderPass({
        label: 'mcpm-galaxy-points',
        colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, camBindGroup);
      pass.setBindGroup(1, pointBindGroup);
      // Instances, not vertices: only the catalog prefix of the lanes is drawn.
      pass.draw(VERTICES_PER_POINT, agents.nDataPoints);
      pass.end();
    },
    dispose(): void {
      camBuffer.destroy();
      overlayParams.destroy();
    },
  };
}
