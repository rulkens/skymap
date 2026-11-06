/**
 * The streaks' pick pipeline: the visual draw's vertex buffers through `vsPick`, which shares the
 * streak placement, into the NEAR0 pick target (r32uint, no blend; its depth attachment's format).
 */

import { NEAR0, SLAB_REVERSED_Z } from '../../../../services/engine/frame/slabs';
import { pickDepthFormat } from '../../../../services/engine/frame/pickProgram';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';

export function createStellarStreamsPickPipeline(
  device: GPUDevice,
  layout: GPUPipelineLayout,
  vertex: GPUVertexState,
): GPURenderPipeline {
  return device.createRenderPipeline({
    label: 'stellar-streams-pick-pipeline',
    layout,
    vertex: { ...vertex, entryPoint: 'vsPick' },
    fragment: { module: vertex.module, entryPoint: 'fsPick', targets: [{ format: 'r32uint' }] },
    primitive: { topology: 'triangle-strip' },
    depthStencil: {
      format: pickDepthFormat(NEAR0),
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', SLAB_REVERSED_Z[NEAR0]!),
    },
  });
}
