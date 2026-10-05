/**
 * missionTrailRenderer — sampled-craft trails as screen-space quads in the
 * depthless HDR accumulation, under the same occlusion as the orbit trails
 * (lib/trailOcclusion.wesl owns group 0 bindings 0-1; ours is binding 2).
 * One instance = one segment, read as two endpoint records from the SAME vertex
 * buffer bound twice, the second a vertex later. Per-craft uniforms live in
 * dynamic-offset slots so two crafts in one frame never share a pending write.
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MissionTrailRenderer } from '../../../../@types/rendering/missionTrailRenderer/MissionTrailRenderer';
import type { MissionTrailFrame } from '../../../../@types/rendering/missionTrailRenderer/MissionTrailFrame';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { MissionTrailGeometry } from '../../../../@types/rendering/missionTrailRenderer/MissionTrailGeometry';
import vsCode from '../../shaders/bodies/missionTrail/vertex.wesl?static';
import fsCode from '../../shaders/bodies/missionTrail/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { splitF64HiLo } from '../../../../utils/math/splitF64HiLo';
import { writeHiLoVertex } from '../../../../utils/math/writeHiLoVertex';
import { OCCLUDER_UNIFORM_BYTES, createTrailOcclusionUniforms } from './trailOcclusionUniforms';

/** One vertex record: posHi (3 floats) then posLo (3 floats). */
export const TRAIL_VERTEX_STRIDE = 24;

/** The two attributes of one endpoint record; `firstLocation` is 0 for the
 *  segment's `a` end and 2 for its `b` end (see `missionTrail/io.wesl`). */
export function endpointAttributes(firstLocation: number): GPUVertexAttribute[] {
  return [
    { shaderLocation: firstLocation, offset: 0, format: 'float32x3' },
    { shaderLocation: firstLocation + 1, offset: 12, format: 'float32x3' },
  ];
}

/** Byte offsets inside `TrailUniforms` (`missionTrail/io.wesl`). */
export const TRAIL_UNIFORM_OFFSETS = {
  viewProj: 0,
  viewportPx: 64,
  pxPerRad: 72,
  camHi: 80,
  opacity: 92,
  camLo: 96,
  widthPx: 108,
  color: 112,
} as const;
export const TRAIL_UNIFORM_BYTES = 128;

// Dynamic offsets must be multiples of minUniformBufferOffsetAlignment (256 max).
const SLOT_STRIDE = 256;
const MAX_TRAILS = 8;
const HEAD_BYTES = 2 * TRAIL_VERTEX_STRIDE;

/** Interleave split position pairs as [hi3, lo3] per vertex. */
function interleaveHiLo(posMpc: Float64Array): Float32Array {
  const { hi, lo } = splitF64HiLo(posMpc);
  const n = posMpc.length / 3;
  const out = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    out.set(hi.subarray(3 * i, 3 * i + 3), 6 * i);
    out.set(lo.subarray(3 * i, 3 * i + 3), 6 * i + 3);
  }
  return out;
}

export function createMissionTrailRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): MissionTrailRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'missionTrail.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'missionTrail.fragment');

  const occluderBuffer = device.createBuffer({
    label: 'mission-trail-occluder-uniform',
    size: OCCLUDER_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const occluderUniforms = createTrailOcclusionUniforms();
  const trailBuffer = device.createBuffer({
    label: 'mission-trail-uniform',
    size: SLOT_STRIDE * MAX_TRAILS,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const headBuffer = device.createBuffer({
    label: 'mission-trail-head-vbo',
    size: HEAD_BYTES * MAX_TRAILS,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'mission-trail-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: TRAIL_UNIFORM_BYTES },
      },
    ],
  });
  const pipeline = device.createRenderPipeline({
    label: 'mission-trail-pipeline',
    layout: device.createPipelineLayout({
      label: 'mission-trail-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: TRAIL_VERTEX_STRIDE,
          stepMode: 'instance',
          attributes: endpointAttributes(0),
        },
        {
          arrayStride: TRAIL_VERTEX_STRIDE,
          stepMode: 'instance',
          attributes: endpointAttributes(2),
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

  let vertexBuffer: GPUBuffer | null = null;
  let uploadedVersion = -1;
  let tracks: ReadonlyMap<string, MissionTrailGeometry> = new Map();
  const firstVertex = new Map<string, number>();
  const uniformScratch = new Float32Array(TRAIL_UNIFORM_BYTES / 4);
  const headScratch = new Float32Array(HEAD_BYTES / 4);
  const eyeScratch = new Float32Array(6);
  let bindGroup: { readonly depthView: GPUTextureView; readonly group: GPUBindGroup } | null = null;
  let slot = 0;

  function ensureTracks(
    version: number,
    sunMpc: Readonly<Vec3>,
    build: (sunMpc: Readonly<Vec3>) => readonly MissionTrailGeometry[],
  ): ReadonlyMap<string, MissionTrailGeometry> {
    if (version === uploadedVersion) return tracks;
    uploadedVersion = version;
    vertexBuffer?.destroy();
    vertexBuffer = null;
    firstVertex.clear();
    const built = build(sunMpc);
    tracks = new Map(built.map((t) => [t.id, t]));
    const total = built.reduce((sum, t) => sum + t.posMpc.length / 3, 0);
    if (total === 0) return tracks;
    const data = new Float32Array(total * 6);
    let at = 0;
    for (const t of built) {
      firstVertex.set(t.id, at);
      data.set(interleaveHiLo(t.posMpc), at * 6);
      at += t.posMpc.length / 3;
    }
    vertexBuffer = device.createBuffer({
      label: 'mission-trail-vbo',
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, data);
    return tracks;
  }

  function beginFrame(pass: GPURenderPassEncoder, frame: MissionTrailFrame): void {
    const { vp, camPosMpc, viewportPx, pxPerRad, occluders, depth } = frame;
    slot = 0;
    occluderUniforms.write(occluders, depth.frame, viewportPx);
    device.queue.writeBuffer(occluderBuffer, 0, occluderUniforms.scratch);
    if (bindGroup === null || bindGroup.depthView !== depth.view) {
      bindGroup = {
        depthView: depth.view,
        group: device.createBindGroup({
          label: 'mission-trail-bg',
          layout: bindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: occluderBuffer } },
            { binding: 1, resource: depth.view },
            { binding: 2, resource: { buffer: trailBuffer, size: TRAIL_UNIFORM_BYTES } },
          ],
        }),
      };
    }
    // The per-view uniform fields are filled once here; drawTrail overwrites
    // only opacity / width / colour.
    const o = TRAIL_UNIFORM_OFFSETS;
    writeHiLoVertex(camPosMpc, 0, eyeScratch, 0);
    uniformScratch.set(vp, o.viewProj / 4);
    uniformScratch[o.viewportPx / 4] = viewportPx[0];
    uniformScratch[o.viewportPx / 4 + 1] = viewportPx[1];
    uniformScratch[o.pxPerRad / 4] = pxPerRad;
    for (let k = 0; k < 3; k++) {
      uniformScratch[o.camHi / 4 + k] = eyeScratch[k]!;
      uniformScratch[o.camLo / 4 + k] = eyeScratch[3 + k]!;
    }
    pass.setPipeline(pipeline);
  }

  function drawTrail(
    pass: GPURenderPassEncoder,
    id: string,
    color: Readonly<Vec3>,
    opacity: number,
    widthPx: number,
    segmentCount: number,
    tailVertex: number,
    headMpc: Readonly<Vec3> | null,
  ): void {
    const first = firstVertex.get(id);
    if (vertexBuffer === null || bindGroup === null || first === undefined || slot >= MAX_TRAILS) {
      return;
    }
    const o = TRAIL_UNIFORM_OFFSETS;
    uniformScratch[o.opacity / 4] = opacity;
    uniformScratch[o.widthPx / 4] = widthPx;
    uniformScratch[o.color / 4] = color[0];
    uniformScratch[o.color / 4 + 1] = color[1];
    uniformScratch[o.color / 4 + 2] = color[2];
    device.queue.writeBuffer(trailBuffer, slot * SLOT_STRIDE, uniformScratch);
    pass.setBindGroup(0, bindGroup.group, [slot * SLOT_STRIDE]);

    if (segmentCount > 0) {
      pass.setVertexBuffer(0, vertexBuffer, first * TRAIL_VERTEX_STRIDE);
      pass.setVertexBuffer(1, vertexBuffer, (first + 1) * TRAIL_VERTEX_STRIDE);
      pass.draw(6, segmentCount);
    }
    if (headMpc !== null) {
      writeHiLoVertex(tracks.get(id)!.posMpc, 3 * tailVertex, headScratch, 0);
      writeHiLoVertex(headMpc, 0, headScratch, 6);
      device.queue.writeBuffer(headBuffer, slot * HEAD_BYTES, headScratch);
      pass.setVertexBuffer(0, headBuffer, slot * HEAD_BYTES);
      pass.setVertexBuffer(1, headBuffer, slot * HEAD_BYTES + TRAIL_VERTEX_STRIDE);
      pass.draw(6, 1);
    }
    slot++;
  }

  function destroy(): void {
    vertexBuffer?.destroy();
    vertexBuffer = null;
    occluderBuffer.destroy();
    trailBuffer.destroy();
    headBuffer.destroy();
  }

  const renderer: MissionTrailRenderer = {
    label: 'missionTrailRenderer',
    ensureTracks,
    beginFrame,
    drawTrail,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
