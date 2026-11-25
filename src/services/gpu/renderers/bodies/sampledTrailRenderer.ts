/**
 * sampledTrailRenderer — the trails of bodies on sampled tracks as screen-space quads in the
 * depthless HDR accumulation, under the same occlusion as the orbit trails
 * (lib/trailOcclusion.wesl owns group 0 bindings 0-1; ours is binding 2).
 * One instance = one segment, read as two endpoint records from the SAME vertex
 * buffer bound twice, the second a vertex later. Every piece of every body (the
 * Sun trail and each planet stay) shares that buffer, found by the piece object.
 * Each draw takes its own dynamic-offset uniform slot and head slot, so two draws
 * in one frame, even for one body, never share a pending write.
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { SampledTrailRenderer } from '../../../../@types/rendering/sampledTrailRenderer/SampledTrailRenderer';
import type { SampledTrailFrame } from '../../../../@types/rendering/sampledTrailRenderer/SampledTrailFrame';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { SampledTrail } from '../../../../@types/rendering/sampledTrailRenderer/SampledTrail';
import type { SampledTrailGeometry } from '../../../../@types/rendering/sampledTrailRenderer/SampledTrailGeometry';
import vsCode from '../../shaders/bodies/sampledTrail/vertex.wesl?static';
import fsCode from '../../shaders/bodies/sampledTrail/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { buildSampledTrails } from '../../../../utils/trails/buildSampledTrails';
import { SAMPLED_TRAIL_WIDTH_PX } from '../../../../data/bodies/sampledTrailStyle';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { writeHiLoVertex } from '../../../../utils/math/writeHiLoVertex';
import { OCCLUDER_UNIFORM_BYTES, createTrailOcclusionUniforms } from './trailOcclusionUniforms';

/** One vertex record: posHi (3 floats) then posLo (3 floats). */
export const TRAIL_VERTEX_STRIDE = 24;

/** The two attributes of one endpoint record; `firstLocation` is 0 for the
 *  segment's `a` end and 2 for its `b` end (see `sampledTrail/io.wesl`). */
export function endpointAttributes(firstLocation: number): GPUVertexAttribute[] {
  return [
    { shaderLocation: firstLocation, offset: 0, format: 'float32x3' },
    { shaderLocation: firstLocation + 1, offset: 12, format: 'float32x3' },
  ];
}

/** Byte offsets inside `TrailUniforms` (`sampledTrail/io.wesl`). */
export const TRAIL_UNIFORM_OFFSETS = {
  viewProj: 0,
  viewportPx: 64,
  pxPerRad: 72,
  camHi: 80,
  opacity: 92,
  camLo: 96,
  widthPx: 108,
  color: 112,
  fadeInvKm: 124,
  fadeRelKm: 128,
} as const;
export const TRAIL_UNIFORM_BYTES = 144;

// Dynamic offsets must be multiples of minUniformBufferOffsetAlignment (256 max).
const SLOT_STRIDE = 256;
const MAX_TRAILS = 8;
const HEAD_BYTES = 2 * TRAIL_VERTEX_STRIDE;
const KM_TO_MPC = SCALE_UNITS.KM_TO_MPC;

export function createSampledTrailRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): SampledTrailRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'sampledTrail.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'sampledTrail.fragment');

  const occluderBuffer = device.createBuffer({
    label: 'sampled-trail-occluder-uniform',
    size: OCCLUDER_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const occluderUniforms = createTrailOcclusionUniforms();
  const trailBuffer = device.createBuffer({
    label: 'sampled-trail-uniform',
    size: SLOT_STRIDE * MAX_TRAILS,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const headBuffer = device.createBuffer({
    label: 'sampled-trail-head-vbo',
    size: HEAD_BYTES * MAX_TRAILS,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'sampled-trail-bgl',
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
    label: 'sampled-trail-pipeline',
    layout: device.createPipelineLayout({
      label: 'sampled-trail-pipeline-layout',
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
  let tracks: readonly SampledTrail[] = [];
  const firstVertex = new Map<SampledTrailGeometry, number>();
  const uniformScratch = new Float32Array(TRAIL_UNIFORM_BYTES / 4);
  const headScratch = new Float32Array(HEAD_BYTES / 4);
  const eyeScratch = new Float32Array(6);
  const relScratch = new Float64Array(3);
  const eyeMpc = new Float64Array(3);
  let bindGroup: { readonly depthView: GPUTextureView; readonly group: GPUBindGroup } | null = null;
  let slot = 0;
  let warnedFull = false;

  function ensureTracks(version: number, ids: readonly SceneBodyId[]): readonly SampledTrail[] {
    if (version === uploadedVersion) return tracks;
    uploadedVersion = version;
    vertexBuffer?.destroy();
    vertexBuffer = null;
    firstVertex.clear();
    tracks = buildSampledTrails(ids);
    const pieces = tracks.flatMap((t) => [t.whole, ...t.near.map((n) => n.piece)]);
    const total = pieces.reduce((sum, p) => sum + p.relMpc.length / 3, 0);
    if (total === 0) return tracks;
    const data = new Float32Array(total * 6);
    let at = 0;
    for (const piece of pieces) {
      firstVertex.set(piece, at);
      for (let i = 0; i < piece.relMpc.length / 3; i++) {
        writeHiLoVertex(piece.relMpc, 3 * i, data, 6 * (at + i));
      }
      at += piece.relMpc.length / 3;
    }
    vertexBuffer = device.createBuffer({
      label: 'sampled-trail-vbo',
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, data);
    return tracks;
  }

  function beginFrame(pass: GPURenderPassEncoder, frame: SampledTrailFrame): void {
    const { vp, camPosMpc, viewportPx, pxPerRad, occluders, depth } = frame;
    slot = 0;
    occluderUniforms.write(occluders, depth.frame, viewportPx);
    device.queue.writeBuffer(occluderBuffer, 0, occluderUniforms.scratch);
    if (bindGroup === null || bindGroup.depthView !== depth.view) {
      bindGroup = {
        depthView: depth.view,
        group: device.createBindGroup({
          label: 'sampled-trail-bg',
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
    // opacity, colour and the eye, which it states relative to the trail's centre.
    const o = TRAIL_UNIFORM_OFFSETS;
    eyeMpc.set(camPosMpc);
    uniformScratch.set(vp, o.viewProj / 4);
    uniformScratch[o.viewportPx / 4] = viewportPx[0];
    uniformScratch[o.viewportPx / 4 + 1] = viewportPx[1];
    uniformScratch[o.pxPerRad / 4] = pxPerRad;
    uniformScratch[o.widthPx / 4] = SAMPLED_TRAIL_WIDTH_PX;
    pass.setPipeline(pipeline);
  }

  function drawTrail(
    pass: GPURenderPassEncoder,
    piece: SampledTrailGeometry,
    color: Readonly<Vec3>,
    opacity: number,
    segmentCount: number,
    centreMpc: Readonly<Vec3>,
    headMpc: Readonly<Vec3> | null,
    fadeMpc: Readonly<Vec3>,
    fadeRadiusMpc: number,
  ): void {
    const first = firstVertex.get(piece);
    if (vertexBuffer === null || bindGroup === null || first === undefined) return;
    if (slot >= MAX_TRAILS) {
      if (!warnedFull) {
        warnedFull = true;
        console.warn(
          `sampledTrailRenderer: more than ${MAX_TRAILS} trail draws in one view; the rest are skipped`,
        );
      }
      return;
    }
    const o = TRAIL_UNIFORM_OFFSETS;
    // Vertices are centre-relative, so the shader's eye is too: subtracted in f64, then split.
    for (let k = 0; k < 3; k++) relScratch[k] = eyeMpc[k]! - centreMpc[k]!;
    writeHiLoVertex(relScratch, 0, eyeScratch, 0);
    for (let k = 0; k < 3; k++) {
      uniformScratch[o.camHi / 4 + k] = eyeScratch[k]!;
      uniformScratch[o.camLo / 4 + k] = eyeScratch[3 + k]!;
    }
    uniformScratch[o.opacity / 4] = opacity;
    uniformScratch[o.color / 4] = color[0];
    uniformScratch[o.color / 4 + 1] = color[1];
    uniformScratch[o.color / 4 + 2] = color[2];
    // Eye-relative km in plain f32: a fade tens of millions of km wide needs no hi/lo pair.
    uniformScratch[o.fadeInvKm / 4] = fadeRadiusMpc > 0 ? KM_TO_MPC / fadeRadiusMpc : 0;
    for (let k = 0; k < 3; k++) {
      uniformScratch[o.fadeRelKm / 4 + k] = (fadeMpc[k]! - eyeMpc[k]!) / KM_TO_MPC;
    }
    device.queue.writeBuffer(trailBuffer, slot * SLOT_STRIDE, uniformScratch);
    pass.setBindGroup(0, bindGroup.group, [slot * SLOT_STRIDE]);

    if (segmentCount > 0) {
      pass.setVertexBuffer(0, vertexBuffer, first * TRAIL_VERTEX_STRIDE);
      pass.setVertexBuffer(1, vertexBuffer, (first + 1) * TRAIL_VERTEX_STRIDE);
      pass.draw(6, segmentCount);
    }
    if (headMpc !== null) {
      writeHiLoVertex(piece.relMpc, 3 * segmentCount, headScratch, 0);
      for (let k = 0; k < 3; k++) relScratch[k] = headMpc[k]! - centreMpc[k]!;
      writeHiLoVertex(relScratch, 0, headScratch, 6);
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

  const renderer: SampledTrailRenderer = {
    label: 'sampledTrailRenderer',
    ensureTracks,
    beginFrame,
    drawTrail,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
