/**
 * diskRadiusRing — dev overlay: draws a world-space ring at a famous galaxy's
 * procedural-disk radius, in the disk plane, on `texturedDisks`'s own basis
 * (`lib/orientation::diskAxes`) — a calibration aid for whether `diameterKpc`
 * maps to the right world radius ("does the disk fill the ring?").
 */

import vsCode from '../../../services/gpu/shaders/diskRadiusRing/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/diskRadiusRing/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { PREMULTIPLIED_OVER_BLEND } from '../../../services/gpu/lib/blendStates';
import type { DiskRadiusRing } from '../../../@types/rendering/DiskRadiusRing';
import type { Vec3 } from '../../../@types/math/Vec3';

/** Shared CameraUniforms prefix — viewProj(64) + viewportPx(8) + pads(8). */
const CAMERA_UNIFORM_BYTES = 80;

/**
 * DiskRadiusRingUniforms: center(12) + radiusWorld(4) + paDeg(4) +
 * axisRatio(4) + 2 pads(8) = 32 bytes, 16-byte aligned.
 */
const RING_UNIFORM_BYTES = 32;

/**
 * Vertex count for the closed line-strip ring. MUST equal the WESL
 * shader's `SEGMENTS` (96) + 1 — vertex 96 wraps theta to 2*pi, landing
 * back on vertex 0 to close the strip. Changing one without the other
 * leaves the ring open (too few) or overruns the loop (too many).
 */
const SEGMENTS_PLUS_ONE = 97;

export function createDiskRadiusRing(device: GPUDevice): DiskRadiusRing {
  // Camera prefix at @binding 0 (per-frame), ring data at @binding 1 (per-selection) —
  // same split as selectionRing, each uploaded at its own cadence.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'disk-radius-ring-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'diskRadiusRing.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'diskRadiusRing.fragment');

  // Built on the first draw and rebuilt only when the target format changes —
  // an HDR toggle reconfigures the canvas, and a pipeline baked for the old
  // format would fail validation on the next draw.
  let pipeline: GPURenderPipeline | null = null;
  let pipelineFormat: GPUTextureFormat | null = null;

  function pipelineFor(format: GPUTextureFormat): GPURenderPipeline {
    if (pipeline !== null && pipelineFormat === format) return pipeline;
    pipeline = device.createRenderPipeline({
      label: 'disk-radius-ring-pipeline',
      layout: device.createPipelineLayout({
        label: 'disk-radius-ring-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module: vsModule, entryPoint: 'vs' },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied-alpha OVER — a UI overlay drawn post-tone-map;
            // the fragment emits 'rgb * alpha, alpha' (see module header).
            blend: PREMULTIPLIED_OVER_BLEND,
          },
        ],
      },
      primitive: { topology: 'line-strip' },
    });
    pipelineFormat = format;
    return pipeline;
  }

  const cameraBuffer = device.createBuffer({
    label: 'disk-radius-ring-camera',
    size: CAMERA_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const ringBuffer = device.createBuffer({
    label: 'disk-radius-ring-ring',
    size: RING_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: 'disk-radius-ring-bg',
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: ringBuffer } },
    ],
  });

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    targetFormat: GPUTextureFormat,
    args: { center: Vec3; radiusWorld: number; axisRatioForTilt: number; paDeg: number },
  ): void {
    // Camera UBO: viewProj at floats [0..15]. viewportPx ([16..17]) is
    // left zero — the ring does no pixel-space math, so it never reads
    // the viewport. Trailing pads stay zero via Float32Array zero-init.
    const camUni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    camUni.set(viewProj, 0);
    device.queue.writeBuffer(cameraBuffer, 0, camUni);

    // Ring UBO (matches DiskRadiusRingUniforms byte layout):
    //   floats [0..2] center.xyz   (bytes  0..11)
    //   float  [3]    radiusWorld  (bytes 12..15)
    //   float  [4]    paDeg        (bytes 16..19)
    //   float  [5]    axisRatio    (bytes 20..23)
    //   floats [6..7] pads, zero   (bytes 24..31)
    const ringUni = new Float32Array(RING_UNIFORM_BYTES / 4);
    ringUni[0] = args.center[0];
    ringUni[1] = args.center[1];
    ringUni[2] = args.center[2];
    ringUni[3] = args.radiusWorld;
    ringUni[4] = args.paDeg;
    ringUni[5] = args.axisRatioForTilt;
    device.queue.writeBuffer(ringBuffer, 0, ringUni);

    pass.setPipeline(pipelineFor(targetFormat));
    pass.setBindGroup(0, bindGroup);
    // SEGMENTS_PLUS_ONE (97) MUST equal the shader's SEGMENTS (96) + 1 —
    // see the const docblock above.
    pass.draw(SEGMENTS_PLUS_ONE, 1, 0, 0);
  }

  function destroy(): void {
    cameraBuffer.destroy();
    ringBuffer.destroy();
  }

  return { draw, destroy };
}
