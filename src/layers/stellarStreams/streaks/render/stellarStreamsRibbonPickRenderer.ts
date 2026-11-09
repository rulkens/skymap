/**
 * StellarStreamsRibbonPickRenderer — the streams' pick: static ribbons along each stream's
 * centreline (`stellarStreams/ribbonPick/`), one instanced quad per segment out of a small buffer built from
 * the meta, into the NEAR0 pick target (r32uint, no blend; its depth attachment's format).
 * Segments are grouped by stream, so a focus draws its stream's run alone.
 */

import type { StellarStreamsRibbonPickRenderer } from '../@types/StellarStreamsRibbonPickRenderer';
import type { StellarStreamRibbons } from '../@types/StellarStreamRibbons';

import vsCode from '../../../../services/gpu/shaders/stellarStreams/ribbonPick/vertex.wesl?static';
import fsCode from '../../../../services/gpu/shaders/stellarStreams/ribbonPick/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../../services/gpu/shaderCompileLogger';
import {
  CAMERA_UNIFORM_BYTES,
  writeCameraPrefix,
} from '../../../../services/gpu/lib/cameraUniforms';
import { NEAR0, SLAB_REVERSED_Z } from '../../../../services/engine/frame/slabs';
import { pickDepthFormat } from '../../../../services/engine/frame/pickProgram';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { STELLAR_STREAMS_PICK_MIN_ACROSS_PX } from '../data/stellarStreamsPickMinAcrossPx.constants';
import { STELLAR_STREAM_RIBBON_RECORD_LANES } from '../data/stellarStreamRibbonRecord.constants';
import { stellarStreamRibbons } from '../utils/stellarStreamRibbons';

// The WGSL struct's 100 bytes rounded up to its 16-byte alignment.
const UNIFORMS_BYTES = 112;
// 4-byte slots after the camera prefix; `Uniforms` in ribbonPick/io.wesl must agree.
const EYE = CAMERA_UNIFORM_BYTES / 4;
const MIN_HALF_WIDTH_PX = EYE + 3;
const PICK_BASE = EYE + 4;

export function createStellarStreamsRibbonPickRenderer(
  device: GPUDevice,
  pickCode: number,
): StellarStreamsRibbonPickRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'stellar-streams-ribbon-pick-vs');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'stellar-streams-ribbon-pick-fs');
  const bgl = device.createBindGroupLayout({
    label: 'stellar-streams-ribbon-pick-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const uniforms = device.createBuffer({
    label: 'stellar-streams-ribbon-pick-uniforms',
    size: UNIFORMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    label: 'stellar-streams-ribbon-pick-bg',
    layout: bgl,
    entries: [{ binding: 0, resource: { buffer: uniforms } }],
  });
  const pipeline = device.createRenderPipeline({
    label: 'stellar-streams-ribbon-pick-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: STELLAR_STREAM_RIBBON_RECORD_LANES * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32' },
            { shaderLocation: 3, offset: 28, format: 'uint32' },
          ],
        },
      ],
    },
    fragment: { module: fsModule, entryPoint: 'fs', targets: [{ format: 'r32uint' }] },
    primitive: { topology: 'triangle-strip' },
    depthStencil: {
      format: pickDepthFormat(NEAR0),
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', SLAB_REVERSED_Z[NEAR0]!),
    },
  });
  const scratch = new Float32Array(UNIFORMS_BYTES / 4);
  new Uint32Array(scratch.buffer)[PICK_BASE] = packSelection(pickCode, PICK_SENTINEL_OFFSET);
  scratch[MIN_HALF_WIDTH_PX] = STELLAR_STREAMS_PICK_MIN_ACROSS_PX / 2;

  let segments: GPUBuffer | null = null;
  let ranges: StellarStreamRibbons['ranges'] = [];
  let segmentCount = 0;

  return {
    upload(meta) {
      const ribbons = stellarStreamRibbons(meta);
      segments?.destroy();
      segments = device.createBuffer({
        label: 'stellar-streams-ribbon-segments',
        size: ribbons.records.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(segments, 0, ribbons.records);
      ranges = ribbons.ranges;
      segmentCount = ribbons.records.byteLength / (STELLAR_STREAM_RIBBON_RECORD_LANES * 4);
    },
    clear() {
      segments?.destroy();
      segments = null;
    },
    draw(pass, rebasedVp, viewportPx, pxPerRad, eye, focusedStream) {
      const run = focusedStream < 0 ? { first: 0, count: segmentCount } : ranges[focusedStream];
      if (segments === null || run === undefined || run.count === 0) return;
      writeCameraPrefix(scratch, rebasedVp, viewportPx, pxPerRad);
      scratch.set(eye, EYE);
      device.queue.writeBuffer(uniforms, 0, scratch);
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, segments);
      pass.setBindGroup(0, bindGroup);
      pass.draw(4, run.count, 0, run.first);
    },
    destroy() {
      segments?.destroy();
      uniforms.destroy();
    },
  };
}
