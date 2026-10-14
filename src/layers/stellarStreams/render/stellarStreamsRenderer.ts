/**
 * StellarStreamsRenderer — PROTOTYPE. Instanced streak billboards, one per
 * stream particle (40-byte records: pos xyz Mpc, unit tangent xyz, size Mpc,
 * luminosity, colour t, stream id), drawn twice per frame — sharp streaks, then
 * a wide low haze — each with its own 128-byte uniform block, since two
 * `writeBuffer`s into one buffer before submit would leave only the last.
 */

import type { StellarStreamsRenderer } from '../@types/StellarStreamsRenderer';

import streamsCode from '../../../services/gpu/shaders/stellarStreams/streams.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { writeCameraPrefix } from '../../../services/gpu/lib/cameraUniforms';

const UNIFORMS_BYTES = 128;
const RECORD_F32 = 10;

export function createStellarStreamsRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): StellarStreamsRenderer {
  const module = createShaderModuleWithDevLog(device, streamsCode, 'stellar-streams');
  const bgl = device.createBindGroupLayout({
    label: 'stellar-streams-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const slots = [0, 1].map((i) => {
    const buffer = device.createBuffer({
      label: `stellar-streams-uniforms-${i}`,
      size: UNIFORMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      label: `stellar-streams-bg-${i}`,
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer } }],
    });
    return { buffer, bindGroup };
  });
  const scratch = new Float32Array(UNIFORMS_BYTES / 4);

  const pipeline = device.createRenderPipeline({
    label: 'stellar-streams-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: RECORD_F32 * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }] },
    primitive: { topology: 'triangle-strip' },
  });

  let instances: GPUBuffer | null = null;
  let count = 0;

  return {
    hasData: () => instances !== null,
    upload(records) {
      instances?.destroy();
      instances = device.createBuffer({
        label: 'stellar-streams-instances',
        size: records.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(instances, 0, records);
      count = records.length / RECORD_F32;
    },
    draw(pass, rebasedVp, viewportPx, pxPerRad, eye, timeSec, looks) {
      if (instances === null) return;
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, instances);
      looks.forEach((look, i) => {
        const slot = slots[i]!;
        scratch.fill(0);
        writeCameraPrefix(scratch, rebasedVp, viewportPx, pxPerRad);
        scratch.set(eye, 20);
        scratch[23] = look.intensity;
        scratch[24] = look.sizeScale;
        scratch[25] = look.stretch;
        scratch[26] = look.minPx;
        scratch[27] = timeSec;
        scratch[28] = look.flow;
        device.queue.writeBuffer(slot.buffer, 0, scratch);
        pass.setBindGroup(0, slot.bindGroup);
        pass.draw(4, count);
      });
    },
    destroy() {
      instances?.destroy();
      slots.forEach((s) => s.buffer.destroy());
    },
  };
}
