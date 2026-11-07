/**
 * StellarStreamsRenderer — instanced streak billboards, one per
 * stream particle (40-byte records: pos xyz Mpc, unit tangent xyz, size Mpc,
 * luminosity, colour t, stream id), drawn once per look per frame — sharp streaks
 * full-res, the wide haze into its half-res target — each look through its own
 * 128-byte uniform block, since two `writeBuffer`s into one buffer before submit
 * would leave only the last.
 */

import type { StellarStreamsRenderer } from '../@types/StellarStreamsRenderer';
import type { StellarStreamsLook } from '../@types/StellarStreamsLook';
import type { StellarStreamsFocus } from '../@types/StellarStreamsFocus';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';

import streamsCode from '../../../../services/gpu/shaders/stellarStreams/streams.wesl?static';
import { createShaderModuleWithDevLog } from '../../../../services/gpu/shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../../../services/gpu/lib/blendStates';
import {
  CAMERA_UNIFORM_BYTES,
  writeCameraPrefix,
} from '../../../../services/gpu/lib/cameraUniforms';
import { STELLAR_STREAMS_RECORD_F32 } from '../../catalog/data/stellarStreamsFormat.constants';

// The WGSL struct's 124 bytes rounded up to its 16-byte alignment.
const UNIFORMS_BYTES = 128;
// f32 slots after the camera prefix; `Uniforms` in streams.wesl must agree.
const EYE = CAMERA_UNIFORM_BYTES / 4;
const INTENSITY = EYE + 3;
const SIZE_SCALE = INTENSITY + 1;
const STRETCH = INTENSITY + 2;
const MIN_PX = INTENSITY + 3;
const TIME_SEC = INTENSITY + 4;
const FLOW = INTENSITY + 5;
const FOCUSED_STREAM = INTENSITY + 6;
const RECEDE = INTENSITY + 7;
const SLOT_OF = { streak: 0, haze: 1 } as const;

export function createStellarStreamsRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): StellarStreamsRenderer {
  const module = createShaderModuleWithDevLog(device, streamsCode, 'stellar-streams');
  const bgl = device.createBindGroupLayout({
    label: 'stellar-streams-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
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
          arrayStride: STELLAR_STREAMS_RECORD_F32 * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-strip' },
  });

  let instances: GPUBuffer | null = null;
  let count = 0;

  function writeLook(
    slotIndex: number,
    rebasedVp: Float32Array,
    viewportPx: Readonly<Vec2>,
    pxPerRad: number,
    eye: Readonly<Vec3>,
    timeSec: number,
    look: StellarStreamsLook,
    intensity: number,
    focus: StellarStreamsFocus,
  ): GPUBindGroup {
    const slot = slots[slotIndex]!;
    scratch.fill(0);
    writeCameraPrefix(scratch, rebasedVp, viewportPx, pxPerRad);
    scratch.set(eye, EYE);
    scratch[INTENSITY] = intensity;
    scratch[SIZE_SCALE] = look.sizeScale;
    scratch[STRETCH] = look.stretch;
    scratch[MIN_PX] = look.minPx;
    scratch[TIME_SEC] = timeSec;
    scratch[FLOW] = look.flow;
    scratch[FOCUSED_STREAM] = focus.focusedStream;
    scratch[RECEDE] = focus.recede;
    device.queue.writeBuffer(slot.buffer, 0, scratch);
    return slot.bindGroup;
  }

  return {
    hasData: () => instances !== null,
    upload({ records, particleCount }) {
      instances?.destroy();
      instances = device.createBuffer({
        label: 'stellar-streams-instances',
        size: records.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(instances, 0, records);
      count = particleCount;
    },
    clear() {
      instances?.destroy();
      instances = null;
    },
    draw(pass, which, rebasedVp, viewportPx, pxPerRad, eye, timeSec, look, opacity, focus) {
      const intensity = look.intensity * opacity;
      if (instances === null || intensity <= 0) return;
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, instances);
      pass.setBindGroup(
        0,
        writeLook(
          SLOT_OF[which],
          rebasedVp,
          viewportPx,
          pxPerRad,
          eye,
          timeSec,
          look,
          intensity,
          focus,
        ),
      );
      pass.draw(4, count);
    },
    destroy() {
      instances?.destroy();
      slots.forEach((s) => s.buffer.destroy());
    },
  };
}
