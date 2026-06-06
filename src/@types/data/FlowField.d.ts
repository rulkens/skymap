/**
 * FlowField — the GPU-side handle for a velocity flow field.
 *
 * Pairs the uploaded 3D texture (rgba16float: rgb = velocity km/s in the
 * cube's native frame, a = overdensity δ) with the shared linear sampler the
 * flow layer binds, and the `FlowFieldMeta` the renderer reads to place the
 * cube in world space and normalise particle motion.  The renderer never sees
 * the `GPUTexture` itself — only a `GPUTextureView` for binding — so `dispose`
 * is the one escape hatch back to the underlying resource for teardown.
 *
 * Shape pinned here so the loader (`createFlowField`) and the consuming layer
 * agree on the handle without a barrel; both deep-import this file.
 */

import type { FlowFieldMeta } from './FlowFieldMeta';

export type FlowField = {
  readonly textureView: GPUTextureView;
  readonly sampler: GPUSampler;
  readonly meta: FlowFieldMeta;
  dispose(): void;
};
