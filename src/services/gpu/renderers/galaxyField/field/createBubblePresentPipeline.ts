/**
 * createBubblePresentPipeline — the bubble-view overlay: one instanced
 * camera-facing quad per SF-event placement, no storage buffer.
 * bubblePresent/vertex.wesl reads its per-instance center/radius/kind straight
 * off the vertex buffer the HOST packs, and `u` (fieldUbo) only for the camera
 * basis + its own crossfade weight — so this bind group needs just binding 0,
 * built once (fieldUbo's OBJECT never changes, only its content, rewritten
 * every `encode`).
 */

import { ADDITIVE_BLEND } from '../../../lib/blendStates';
import { BUBBLE_RECORD_FLOATS } from './packBubbleInstances';

import bubblePresentVsWgsl from '../../../shaders/milkyWay/field/bubblePresent/vertex.wesl?static';
import bubblePresentFsWgsl from '../../../shaders/milkyWay/field/bubblePresent/fragment.wesl?static';

export function createBubblePresentPipeline(deps: {
  readonly device: GPUDevice;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly fieldUbo: GPUBuffer;
}): { readonly pipeline: GPURenderPipeline; readonly bindGroup: GPUBindGroup } {
  const { device, makeShader, hdrFormat, fieldUbo } = deps;

  const pipeline = device.createRenderPipeline({
    label: 'galaxy:bubblePresentPipe',
    layout: 'auto',
    vertex: {
      module: makeShader(bubblePresentVsWgsl, 'galaxy:bubblePresent.vertex'),
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: BUBBLE_RECORD_FLOATS * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },
            { shaderLocation: 1, offset: 16, format: 'float32' },
          ],
        },
      ],
    },
    fragment: {
      module: makeShader(bubblePresentFsWgsl, 'galaxy:bubblePresent.fragment'),
      entryPoint: 'fs',
      targets: [{ format: hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  return {
    pipeline,
    bindGroup: device.createBindGroup({
      label: 'galaxy:bubblePresentBG',
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: fieldUbo } }],
    }),
  };
}
