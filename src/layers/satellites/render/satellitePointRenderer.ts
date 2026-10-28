/**
 * satellitePointRenderer — the satellites as screen-sized additive dots in the depthless HDR
 * accumulation, under the trails' occlusion (lib/trailOcclusion.wesl owns group 0 bindings 0-1;
 * ours is binding 2). One instance = one satellite: its TEME state at the last sweep, packed
 * densely from the valid objects, so a decayed object costs no vertex work.
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { SatellitePointRenderer } from '../@types/SatellitePointRenderer';
import type { SatelliteSweep } from '../@types/SatelliteSweep';
import vsCode from '../../../services/gpu/shaders/satellites/points/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/satellites/points/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { SATELLITE_POINT_STYLE } from '../../../data/satellites/satellitePointStyle';
import {
  OCCLUDER_UNIFORM_BYTES,
  createTrailOcclusionUniforms,
} from '../../../services/gpu/renderers/bodies/trailOcclusionUniforms';

/** One instance record: posKm (3 floats), velKmS (3 floats), catalog index (u32), class (u32). */
export const SATELLITE_INSTANCE_STRIDE = 32;
export const SATELLITE_INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 0, offset: 0, format: 'float32x3' },
  { shaderLocation: 1, offset: 12, format: 'float32x3' },
  { shaderLocation: 2, offset: 24, format: 'uint32' },
  { shaderLocation: 3, offset: 28, format: 'uint32' },
];

/** Byte offsets inside `SatelliteUniforms` (`satellites/points/io.wesl`). */
export const SATELLITE_UNIFORM_OFFSETS = {
  viewProj: 0,
  viewportPx: 64,
  pxPerRad: 72,
  earthKm: 80,
  dtSec: 92,
  temeToWorld0: 96,
  opacity: 108,
  temeToWorld1: 112,
  sizePx: 124,
  temeToWorld2: 128,
  color: 144,
  classOpacity: 160,
} as const;
export const SATELLITE_UNIFORM_BYTES = 176;

export function createSatellitePointRenderer({
  device,
  targetFormat,
}: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
}): SatellitePointRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'satellitePoints.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'satellitePoints.fragment');

  const occluderBuffer = device.createBuffer({
    label: 'satellite-points-occluder-uniform',
    size: OCCLUDER_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const occluderUniforms = createTrailOcclusionUniforms();
  const uniformBuffer = device.createBuffer({
    label: 'satellite-points-uniform',
    size: SATELLITE_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'satellite-points-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const pipeline = device.createRenderPipeline({
    label: 'satellite-points-pipeline',
    layout: device.createPipelineLayout({
      label: 'satellite-points-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: SATELLITE_INSTANCE_STRIDE,
          stepMode: 'instance',
          attributes: [...SATELLITE_INSTANCE_ATTRIBUTES],
        },
      ],
    },
    // No depthStencil: the hdr target has no depth attachment.
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
  });

  let instanceBuffer: GPUBuffer | null = null;
  let instanceCount = 0;
  let sweep: SatelliteSweep | null = null;
  const uniformScratch = new Float32Array(SATELLITE_UNIFORM_BYTES / 4);
  let bindGroup: { readonly depthView: GPUTextureView; readonly group: GPUBindGroup } | null = null;

  function upload(next: SatelliteSweep, classCode: Uint8Array): void {
    const n = next.valid.length;
    let live = 0;
    for (let k = 0; k < n; k++) live += next.valid[k]!;
    const floats = new Float32Array((Math.max(live, 1) * SATELLITE_INSTANCE_STRIDE) / 4);
    const words = new Uint32Array(floats.buffer);
    let at = 0;
    for (let k = 0; k < n; k++) {
      if (next.valid[k] === 0) continue;
      floats.set(next.posKm.subarray(3 * k, 3 * k + 3), at);
      floats.set(next.velKmS.subarray(3 * k, 3 * k + 3), at + 3);
      words[at + 6] = k;
      words[at + 7] = classCode[k]!;
      at += SATELLITE_INSTANCE_STRIDE / 4;
    }
    const data = floats;
    if (instanceBuffer === null || instanceBuffer.size < data.byteLength) {
      instanceBuffer?.destroy();
      instanceBuffer = device.createBuffer({
        label: 'satellite-points-instances',
        size: data.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(instanceBuffer, 0, data);
    instanceCount = live;
    sweep = next;
  }

  function clear(): void {
    instanceBuffer?.destroy();
    instanceBuffer = null;
    instanceCount = 0;
    sweep = null;
  }

  function draw(
    pass: GPURenderPassEncoder,
    frame: Parameters<SatellitePointRenderer['draw']>[1],
  ): void {
    if (instanceBuffer === null || sweep === null || instanceCount === 0) return;
    const { depth, temeToWorld: m } = frame;
    occluderUniforms.write(frame.occluders, depth.frame, frame.viewportPx);
    device.queue.writeBuffer(occluderBuffer, 0, occluderUniforms.scratch);
    if (bindGroup === null || bindGroup.depthView !== depth.view) {
      bindGroup = {
        depthView: depth.view,
        group: device.createBindGroup({
          label: 'satellite-points-bg',
          layout: bindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: occluderBuffer } },
            { binding: 1, resource: depth.view },
            { binding: 2, resource: { buffer: uniformBuffer } },
          ],
        }),
      };
    }

    const o = SATELLITE_UNIFORM_OFFSETS;
    const u = uniformScratch;
    u.set(frame.vp, o.viewProj / 4);
    u.set(frame.viewportPx, o.viewportPx / 4);
    u[o.pxPerRad / 4] = frame.pxPerRad;
    u.set(frame.earthKm, o.earthKm / 4);
    u[o.dtSec / 4] = (frame.simMs - sweep.simMs) / 1000;
    u.set(m.slice(0, 3), o.temeToWorld0 / 4);
    u.set(m.slice(3, 6), o.temeToWorld1 / 4);
    u.set(m.slice(6, 9), o.temeToWorld2 / 4);
    u[o.opacity / 4] = frame.opacity;
    u.set(frame.classOpacity, o.classOpacity / 4);
    u[o.sizePx / 4] = SATELLITE_POINT_STYLE.radiusPx;
    u.set(SATELLITE_POINT_STYLE.color, o.color / 4);
    device.queue.writeBuffer(uniformBuffer, 0, u);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup.group);
    pass.setVertexBuffer(0, instanceBuffer);
    pass.draw(6, instanceCount);
  }

  function destroy(): void {
    clear();
    occluderBuffer.destroy();
    uniformBuffer.destroy();
  }

  const renderer: SatellitePointRenderer = {
    label: 'satellitePointRenderer',
    upload,
    uploaded: () => sweep,
    clear,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
